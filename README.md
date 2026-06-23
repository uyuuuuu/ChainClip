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
