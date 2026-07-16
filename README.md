<p align="center">
  <img src="./apps/mobile/assets/images/icon.png" style="width: 33%;" alt="Logo" />
</p>

# ChainClip
旅行やお出かけ先で撮影した思い出の動画、見返していますか？  
どのファイルがどの場面の動画かも分からないし、長くて多いから見返すのが億劫……。  
そんな動画たちをダイジェスト形式で、1つにつなげましょう！

1. 動画を画像解析によって場面ごとに分割して、検出された物体のラベルと一緒に一覧表示。笑ったあのシーン、綺麗だったあのシーンを選んでみてください。
2. 選んだシーンはデフォルトで3秒ずつ切り抜かれます。切り抜き個所を調整して、お気に入りの瞬間を切り抜きましょう。
3. あなたが選んだ瞬間を1本につなげた動画が生成されます。動画を保存したり、URLを友人にシェアして素敵な思い出を何度でも楽しみましょう！

# スライド
https://docs.google.com/presentation/d/1PBrZ-UyWVvxnHPs1zQOaX4I4ruw5b_QYk-q0VVPUg10/edit?usp=sharing

# デモ動画
https://drive.google.com/file/d/1JO-t1GbTupP2GKs40Qa2EKpf1JD3kDAl/view?usp=sharing

# 使用技術
### クライアント
- 言語：TypeScript
- モバイル：React Native
- フレームワーク：Expo

### サーバー
- 言語：Python
- APIフレームワーク：FastAPI
- ORM：SQLAlchemy
- マイグレーション：alembic
- テスト：pytest
- 動画変換：FFmpeg
- 解析：Video Intelligence API
- 一時ストレージ：Google Cloud Storage
- 動画ストレージ：cloudflare R2
- RDB：postgresql

### Web
共有動画の閲覧ページ

- 言語：TypeScript
- フレームワーク：Hono
- ビルド：Vite
- スタイリング：Tailwind CSS
- 実行環境：Cloudflare Workers

### インフラ
- APIデプロイ：Google Cloud Run
- 動画処理worker：Google Cloud Run Jobs
- workerコンテナ管理：Docker
