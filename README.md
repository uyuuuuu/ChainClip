# HMI2026

## バックエンドディレクトリ構成

```
app/
├─ domain/        ドメインエンティティ(Project, Clip, Asset, ProcessingJobなど)・値オブジェクト・ドメイン例外を
├─ usecase/       エンドポイントごとの業務ロジック
├─ infra/         DB・外部ストレージ・外部APIなど、外部リソースとのやり取り
│  ├─ db/         DBモデル(SQLAlchemy)・セッション・リポジトリ実装
│  ├─ storage/    動画ファイルの保存先とのやり取り
│  ├─ video/      FFmpegによる動画変換やVideo Intelligence APIによる解析処理
│  └─ worker/     Cloud Run Jobsの起動トリガーを実装する
├─ api/           FastAPIのルーティングと依存性注入を置く
│  └─ routes/     エンドポイント定義を置く
└─ worker/        Cloud Run Jobsで動くprepare/render処理のエントリポイントを置く

alembic/          DBマイグレーション

tests/
├─ fakes.py       usecase層テスト用、DB不要なフェイクrepository実装
├─ usecase/       usecase層のテスト
└─ infra/         repository層のテスト
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

### テスト

```
make install-dev   # pytestなどテスト用パッケージをインストール(初回のみ)
```

usecase層のみ(フェイクrepoを使うのでDB不要、高速):

```
make test-unit
```

repository層も含めた全テスト(ローカルPostgresが必要):

```
make test-db-up    # docker composeでテスト用postgresを起動(初回はimage取得が入る)
make test          # usecase層+repository層を実行
make test-db-down  # 不要になったらテスト用postgresを停止
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
make deploy   # build + push + gcloud run deployを一括実行
```

個別に実行する場合は`make build`(image build)、`make push`(Artifact Registryへpush)、最後の`gcloud run deploy chainclip-api --image ... --region ...`部分がCloud Run上の新しいリビジョンへの反映コマンド。コンソールから該当サービスを開き「新しいリビジョンを編集してデプロイ」→ pushしたimageを選んでデプロイしても一緒。
