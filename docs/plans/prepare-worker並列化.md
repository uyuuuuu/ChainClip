# prepare worker の clip 並列処理

## 背景

現在 prepare worker は、1つの Cloud Run Jobs タスクの中で `for clip in clips` を回し、
プロジェクト内の全動画を**逐次**処理している（`app/worker/prepare.py:45-46`）。
各 clip の処理は GCS ダウンロード → ffmpeg 変換 → Video Intelligence 解析 → アップロードと重く、
合計の待ち時間が「1本あたりの処理時間 × 本数」に比例して伸びる。

これを Cloud Run Jobs の `task_count` によるタスクレベル並列に変更し、1 clip = 1 タスクとして
同時に処理させる。動画5本なら5タスクが並列に走り、待ち時間が本数に比例しなくなる。

`processing_jobs` テーブルは元々 `clip_id` (nullable) と `job_type` の `convert_clip` /
`analyze_clip` を持っており（`docs/ChainClip設計.md` の processing_jobs 節）、
**設計当初から clip 単位のジョブ分割を想定していた**。現状の実装が `full_pipeline` 1本に
まとめているだけなので、今回の変更は元の設計意図に沿う形になる。

**マイグレーションは不要**（必要なカラム・enum 値はすべて既存）。

---

## 調査で確定した事実

### clip_index は 0..N-1 の連番

`app/usecase/request_upload_urls.py:58` の `enumerate(clips)` が唯一の `Clip.create` 呼び出し元。
`assert_status(DRAFT)` を要求するので追加アップロードで穴が開くこともない。

ただし **DB 制約はない**（`ProjectClipModel.clip_index` は `Integer, nullable=False` のみ）。
仕様が暗黙的なので、worker 側では clip_index の値を信用せず
**`list_by_project_id()` が返すリストの位置**でタスクを割り当てる。
このリストは `order_by(clip_index)` 済みなので全タスクで決定的に同じ順序になり、
仮に clip_index が飛び番でもズレを吸収できる。

### Cloud Run Job の現在の設定（`gcloud run jobs describe` で確認済み）

```
Job:            chainclip-prepare-worker (asia-northeast1)
Image:          asia-northeast1-docker.pkg.dev/hmi2026/chainclip/api:latest  # APIと同じイメージ
Command/Args:   python -m app.worker.prepare
Tasks:          1
Parallelism:    No limit          # ← 要変更
Max Retries:    1                 # ← 要変更（非冪等なため）
Task Timeout:   40m
Memory / CPU:   2Gi / 1000m
Env:            DATABASE_URL (Neon の pooler エンドポイント), GCS_BUCKET_NAME
```

Job 定義はリポジトリ内に存在せず（yaml も Terraform も Makefile ターゲットもない）、
**手動 gcloud 管理**になっている。

### google-cloud-run 0.16.1 の API 制約

- `RunJobRequest.Overrides` のフィールドは `container_overrides`, **`task_count`**, `timeout` のみ
- **`Overrides` に `parallelism` は存在しない** → per-run では変更できず、Job 定義側で設定するしかない
- Cloud Run Jobs は各タスクに `CLOUD_RUN_TASK_INDEX`(0始まり) を自動注入する

### 既存テスト

prepare worker のテストは存在しない。影響を受けるのは
`tests/usecase/test_start_prepare.py:48` の `mock_trigger.assert_called_once_with(project.id)` のみ。

---

## 設計

### タスクと clip の対応付け

`CLOUD_RUN_TASK_INDEX` → `clips[task_index]`（位置ベース、clip_index の値には依存しない）。

`task_index >= len(clips)` なら**何もせず正常終了**する。
ここで例外を投げると Cloud Run がリトライするため、異常系の保険として正常終了にする。

### 全 clip 完了の判定 — projects 行の SELECT FOR UPDATE で直列化

各タスクが自分の clip を終えた後に「全 clip が ready か」を判定し、
最後の1本だったタスクが `project.mark_ready()` を呼ぶ。

競合防止は **projects 行のロック**で行う。clips 行をロックしても
「後から状態が変わる他 clip」との整合は取れないため、projects 行をロックしてから
**同一セッションで clips を再読込**するのが要点。ロック待ちしていたタスクは
先行タスクの commit 後に最新の clip 状態を読むため、
「全員が『自分は最後じゃない』と判断して誰も mark_ready しない」lost-update を防げる。

```python
def _finalize_if_last(project_repo, clip_repo, project_id) -> None:
    """自分のclip処理後に呼ぶ。全clipがreadyなら最後の1タスクとしてproject.mark_ready()する。
    projects行をFOR UPDATEでロックし、並列タスク間の二重更新を防ぐ。"""
    project = project_repo.get_by_id_for_update(project_id)
    if project is None:
        return
    # 既にfailed等になっていれば触らない
    if project.status != ProjectStatus.PREPARING:
        project_repo.session.rollback()  # ロック解放
        return
    clips = clip_repo.list_by_project_id(project_id)
    if all(c.status == ClipStatus.READY for c in clips):
        project.mark_ready()
        project_repo.update(project)  # 内部でcommit → ロック解放
    else:
        project_repo.session.rollback()  # ロック解放
```

### 失敗時の扱い — PREPARING ガードで上書き防止

「既に failed の project を後続タスクが ready に上書き」する事故は、
ロック内の `if project.status != ProjectStatus.PREPARING: return` ガードで防ぐ。
加えて `all(READY)` 条件自体が防御になる（1本でも failed なら READY にならない）。

失敗側も同じくロックを取り、**先勝ち**（最初のエラーを保存し、後続の失敗タスクは上書きしない）にする。

```python
def _fail_project(project_repo, project_id, exc) -> None:
    """自分のclipが失敗したらprojectをfailedにする。先に別タスクが
    failedにしていれば最初のエラーを尊重し、上書きしない。"""
    project = project_repo.get_by_id_for_update(project_id)
    if project is None or project.status != ProjectStatus.PREPARING:
        project_repo.session.rollback()
        return
    project.mark_failed(error_phase="prepare", error_code=type(exc).__name__, error_message=str(exc))
    project_repo.update(project)
```

**他タスクは止められない**: Cloud Run Jobs にはタスク間のキャンセル機構がないため、
失敗後も他タスクは走り続け、無駄な変換・解析コストが発生する。これは受容する
（clip 数は高々数本、副作用はなく、走り切っても PREPARING ガードで ready にできない）。

任意の最適化として、`_prepare_clip` 実行**前**に project.status を確認し、
既に FAILED なら早期 return すれば Video Intelligence の課金を減らせる（ロック不要）。

### ProcessingJob の粒度 — clip 単位（CONVERT_CLIP）に変更

**「誰が job を作るか」問題は clip 単位にすれば消滅する。** 各タスクが自分の clip の job を
1つだけ作るので調整が不要。project 単位のまま維持すると「task 0 が作る」→
他タスクが job.id を知る手段がない（DB 検索でレース）→ 複雑化する。

- `job_type=JobType.CONVERT_CLIP`, `clip_id=clip.id` を設定
- `cloud_run_execution_name` に `CLOUD_RUN_EXECUTION` 環境変数を入れるとトレーサビリティが上がる
- いずれも既存フィールド・既存 enum 値 → **マイグレーション不要**
- `ANALYZE_CLIP` と分けるかは、1タスク内で変換と解析が不可分に連続するため**分けない**

### エントリポイント

```python
def run(project_id: uuid.UUID, task_index: int) -> None:
    """prepare workerのタスク1つ分。担当clipを1本だけ処理する。"""
    ...

def main() -> None:
    """Cloud Run Jobsのエントリポイント。環境変数の読み取りはここだけで行う。"""
    run(
        project_id=uuid.UUID(os.environ["PROJECT_ID"]),
        task_index=int(os.environ.get("CLOUD_RUN_TASK_INDEX", "0")),
    )

if __name__ == "__main__":
    main()
```

`CLOUD_RUN_TASK_INDEX` のデフォルトを `"0"` にすることで、ローカル実行時は環境変数なしで
clip 0 本目を処理できる。`run()` が引数で受け取る形なのでテストも環境変数のモックが不要。
`CLOUD_RUN_TASK_COUNT` は使わない（DB の clips 数が信頼できる情報源であり、二重管理を避ける）。

---

## 実装ステップ

### Step 1: `ProjectRepo.get_by_id_for_update` の追加

- `app/infra/db/repository.py`
- `select(ProjectModel).where(...).with_for_update()` を使うメソッドを追加
- `get_by_id` と Project 構築部分が重複するので `_project_from_model(model)` ヘルパーに切り出す
  （既存の `_clip_from_model` と同じパターン）。`get_by_id` / `get_by_share_slug` もこれに合わせる
- `tests/fakes.py` の `FakeProjectRepo` にも `get_by_id_for_update` を追加（`get_by_id` に委譲）
- 検証: `tests/infra/test_repository.py` にクエリが動くことのテストを追加し `make test`
  - 注意: `tests/infra/conftest.py` の session fixture は SAVEPOINT + 単一 connection のため、
    **真のロック競合はこの fixture では再現できない**。クエリの正常動作の確認に留める

### Step 2: `trigger_prepare_job` の task_count 対応

- `app/infra/worker/cloud_run.py`
- `trigger_prepare_job(project_id, *, task_count: int)` に変更、`Overrides(..., task_count=task_count)`
- `task_count < 1` で `ValueError`（`start_prepare` で弾かれているはずだが防御的に）
- `trigger_render_job` は変更なし

### Step 3: `start_prepare` から task_count を渡す

- `app/usecase/start_prepare.py`
- 末尾を `trigger_prepare_job(project.id, task_count=len(clips))` に。`clips` は34行目で取得済み
- 検証: `tests/usecase/test_start_prepare.py:48` を `assert_called_once_with(project.id, task_count=1)`
  に更新し、「2clip なら task_count=2」のケースを追加。`make test-unit` で DB 不要に高速検証

### Step 4: `prepare.py` の書き換え（本丸）

- `app/worker/prepare.py`
- `run(project_id, task_index)`:
  1. project 取得、なければ `ProjectNotFoundError`
  2. `clips = clip_repo.list_by_project_id(project_id)`、`task_index >= len(clips)` なら return
  3. `clip = clips[task_index]`
  4. `job = job_repo.create(ProcessingJob.create(project_id=..., job_type=JobType.CONVERT_CLIP,
     clip_id=clip.id, cloud_run_execution_name=os.environ.get("CLOUD_RUN_EXECUTION")))` → `mark_running`
  5. try: `_prepare_clip(...)` → `_finalize_if_last(...)` → `job.mark_succeeded`
  6. `except DomainError`: `_fail_project(...)` → `job.mark_failed` → re-raise
     （Cloud Run にタスク失敗を伝えるため re-raise は維持）
- 新規: `_finalize_if_last()`, `_fail_project()`, `main()`
- **変更なし**: `_prepare_clip()` — 既に clip 1本を処理する形になっているのでそのまま流用

### Step 5: prepare worker のテスト追加（新規）

- 新規 `tests/worker/test_prepare.py`
- `_prepare_clip` の中身（gcs / ffmpeg / intelligence）は `@patch` でモックし、
  `run(project_id, task_index=N)` を実 DB（`tests/infra/conftest.py` の session fixture 再利用）で駆動。
  `app.worker.prepare.SessionLocal` を patch してテスト用 session を返す形にすると
  実 DB の `with_for_update` 経路も通る
- 押さえるケース:
  - `task_index=0` が 2clip 中1本目だけ処理し、project は PREPARING のまま
  - `task_index=1`（最後）が処理すると project が READY になる
  - `run(0)` → `run(1)` を逐次に呼んで最終的に READY（順序非依存性）
  - 1タスクが失敗 → project が FAILED、その後もう1タスクが成功 → **FAILED のまま維持**
  - `task_index` が clip 数以上 → 何もせず正常終了

### Step 6: Cloud Run Job 定義の更新（デプロイ作業）

現在 `Parallelism: No limit` / `Max Retries: 1`。両方とも変更が必要。

```bash
gcloud run jobs update chainclip-prepare-worker \
  --region=asia-northeast1 \
  --parallelism=3 \
  --max-retries=0
```

- **`--parallelism=3`**: 現状の無制限だと task_count 分が一斉起動し、
  Video Intelligence API のクォータ、CPU/メモリ課金の瞬間ピーク、
  Neon のコネクション数を圧迫する。典型的な clip 数（数本）なら 3 並列で十分な短縮効果がある
- **`--max-retries=0`**: 現在 1。リトライは非冪等（`AssetRepo.create` が重複行を作り、
  `get_project_status._build_ready_clip` の `next(...)` が古い方を拾う可能性、
  `ProcessingJob` も重複作成）なので無効化する

### Step 7: 動作確認

実 clip 2〜3本のプロジェクトで prepare を叩き、
`gcloud run jobs executions list --job=chainclip-prepare-worker --region=asia-northeast1` で
task_count 分のタスクが起動していることを確認。
フロントの `clipsReady` が並列に増えて最終的に ready になることを実機で確認。

---

## 注意すべき落とし穴

1. **ロック解放漏れ**: `get_by_id_for_update` 後に `update` しない分岐で
   `rollback()` / `commit()` を必ず呼ぶ。忘れるとタスクが相互ブロックし、
   Task Timeout (40m) まで刺さる
2. **Neon の pooler 経由**: `DATABASE_URL` が pooler エンドポイント（PgBouncer）を指している。
   PgBouncer のトランザクションモードでは `SELECT FOR UPDATE` を含むトランザクションが
   期待通りに動くか要検証。問題が出る場合は worker だけ direct エンドポイント
   （ホスト名から `-pooler` を除いたもの）を使う必要がある。**Step 4 の実装前に確認すること**
3. **`get_by_id_for_update` を `_prepare_clip` の前に呼ばない**:
   重い処理の間ずっと行ロックを保持すると並列性が消える。ロックは判定の一瞬だけ
4. **`AssetRepo.create` の非冪等性**: `--max-retries=0` にすれば当面問題ないが、
   将来リトライを有効化するなら asset の upsert 化が必要
5. **DB コネクション数**: parallelism 分のタスクがそれぞれ engine プールを持つ。
   parallelism=3 なら問題ないが、大きくする場合は Neon の接続上限を確認

---

## 変更対象ファイル

- `app/worker/prepare.py` — 本丸。`run()` の書き換え、`_finalize_if_last` / `_fail_project` / `main` 追加
- `app/infra/db/repository.py` — `ProjectRepo.get_by_id_for_update` 追加、`_project_from_model` 切り出し
- `app/infra/worker/cloud_run.py` — `trigger_prepare_job` に `task_count` 引数
- `app/usecase/start_prepare.py` — `task_count=len(clips)` を渡す
- `tests/usecase/test_start_prepare.py` — アサーション更新
- `tests/fakes.py` — `FakeProjectRepo.get_by_id_for_update` 追加
- `tests/worker/test_prepare.py` — 新規
