# HMI2026

## バックエンドディレクトリ構成

```
app/
├─ domain/        ドメインエンティティ(Project, Clipなど)・値オブジェクト・ドメイン例外を置く
├─ usecase/       エンドポイントごとの業務ロジック(ユースケース)を置く
├─ infra/         DB・外部ストレージ・外部APIなど、外部リソースとのやり取りを実装する
│  ├─ db/         DBモデル(SQLAlchemy)とリポジトリ実装を置く
│  ├─ storage/    GCS/R2など動画ファイルの保存先とのやり取りを実装する
│  └─ video/      FFmpegによる動画変換やVideo Intelligence APIによる解析処理を実装する
├─ api/           FastAPIのルーティングと依存性注入を置く
│  └─ routes/     エンドポイント定義を置く
└─ worker/        Cloud Run Jobsで動くprepare/render処理のエントリポイントと共通処理を置く
```

## 開発者向け

以下は`apps\server`で実行する。

### セットアップ

```
python -m venv .venv
make activate   # 表示されたコマンドを実行してvenvを有効化
make install    # requirements.txtを一括install
```

### ローカル起動

```
make run
```

### 依存パッケージ追加後

```
make freeze   # 現在のvenvの状態をrequirements.txtに反映
```

### DBマイグレーション(Alembic)

```
make migration m="変更内容の説明"   # models.py編集後、migrationファイルを生成(DBはまだ変更されない)
make migrate                       # 生成済みmigrationをDB(Neon)に反映
make downgrade                     # 直前のmigrationを1つ戻す
```

### デプロイ・再デプロイ

docker desktopを立ち上げた状態で行う。

```
docker build -t asia-northeast1-docker.pkg.dev/hmi2026/chainclip/api:latest .
docker push asia-northeast1-docker.pkg.dev/hmi2026/chainclip/api:latest
gcloud run deploy chainclip-api --image asia-northeast1-docker.pkg.dev/hmi2026/chainclip/api:latest --region asia-northeast1
```

最後の`gcloud run deploy`がCloud Run上の新しいリビジョンへの反映コマンド。コンソールから該当サービスを開き「新しいリビジョンを編集してデプロイ」→ pushしたimageを選んでデプロイしても一緒。
