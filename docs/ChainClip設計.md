# デプロイURL

api
https://api.chainclip.peach-fi-zz.org/
web
https://chainclip.peach-fi-zz.org/

# ユビキタス言語

クリップ：元動画。ユーザーがアップロードした動画  
変換後動画：動画の最適化、mp4変換を行ったもの  
シーン：intelligence apiで分割した区間1つ1つ  
カット：シーン内でユーザーが区間を決めた箇所  
完成動画：カットを繋げて1つのmp4にしたもの

プロジェクト：1回の動画作成の単位  
編集設定（edit_config）：ユーザーが選んだカットの集合のタイムスタンプ、並び順の情報。  
prepare：元動画を解析・変換し、編集可能な状態にするまでの一連のworker処理  
render：編集設定をもとにカットを切り出して結合し、完成動画を作るworker処理

# 全体像

1. モバイルアプリで複数動画を選択する
2. APIにプロジェクト作成リクエストを送る
3. APIがGCSにアップロードするためのsigned URLを発行する
4. モバイルアプリがGCSに動画を直接アップロードする
5. アップロード完了後、モバイルがAPIに完了通知を送る
6. APIがCloud Run Jobsのprepare workerを起動する
7. prepare workerが各動画に対して以下を実行する

- Video Intelligence APIで解析
- FFmpegでmp4変換
- 変換後mp4をGCSに保存
- アプリ表示用のシーン区間JSONを生成してGCSに保存

8. workerがDBのproject statusをreadyに更新する
9. モバイルアプリはAPIをpollingして状態を確認する
10. readyになったら、APIが変換後mp4のsigned URLとシーン区間JSONを返す
11. モバイルアプリ上でユーザーがシーンを選択・並び替えする
12. 編集内容をPOST /renderでAPIに送る
13. APIがrender workerを起動する
14. render workerが選択区間を切り出して結合し、完成mp4を生成する。
15. 完成動画をR2にアップロードする
16. DBのproject statusをcompletedに更新する。GCS内のファイルは削除する。
17. モバイルアプリがAPIをpollingし、完成後に共有URLを表示する
18. 共有URLにアクセスすると動画の再生、全画面表示、タイトルと説明の閲覧、動画削除が出来る。

# 使用技術, 選定理由

▌クライアント  
・言語：TypeScript  
・モバイル：React Native  
→知ってる言語で開発スピードを上げるため  
・ライブラリ：NativeWind, React Native Reusables, Zustand, TanStack Query, Expo Router  
・フレームワーク：Expo  
・ビルド：EAS Build

▌web  
・言語：TypeScript  
・フレームワーク(バックエンド)：Hono  
・ビルド：Vite  
・実行環境：Cloudflare Workers  
[Hono · Cloudflare Workers docs](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)

▌サーバー  
アーキテクチャ：DIP(依存反転)しないオニオンアーキテクチャ

・言語：Python  
→解析に使えるライブラリが多い、apiが複雑でない  
・APIフレームワーク：FastAPI  
→型定義をもとにバリデーションを書きやすく、OpenAPIベースのドキュメントも自動生成されるため、モバイル側とのAPI仕様共有がしやすい点  
・ORM：SQLAlchemy  
・マイグレーション：alembic  
・データバリデーション：Pydantic  
・テスト：pytest  
→pythonでの標準だから。unittestより書きやすい、fastapiもpytestを前提にしてる  
・動画変換：FFmpeg  
・解析：Video Intelligence API  
・一時ストレージ：Google Cloud Storage  
→解析APIの入力がGCSのurlだから  
・動画ストレージ：cloudflare R2  
→エグレス帯域は無料だから  
・RDB：postgresql  
→PostgreSQLにはjsonb型があり、分解済みのバイナリ形式で保存され、入力時は少し重いが処理時に再パース不要で効率が良いから。  
・DBホスト：neon DB  
→無料枠

▌インフラ  
APIデプロイ：Google Cloud Run  
→GoogleCloudでできるだけ統一したい  
動画処理worker：Google Cloud Run Jobs  
[ジョブを作成する | Cloud Run | Google Cloud Documentation](https://docs.cloud.google.com/run/docs/create-jobs?utm_source=chatgpt.com&hl=ja)  
workerコンテナ管理：Docker  
コンテナレジストリ：Artifact Registry(docker imageを保存し管理するGCPの1つ)  
API → Cloud Run **Service**（常駐、HTTPを受ける）  
prepare worker → Cloud Run **Jobs**（起動して処理して終わる）  
render worker → Cloud Run **Jobs**（別のJob）

# テーブル設計

▌設計意図  
・動画処理は、アップロード・解析・変換・編集・完成と状態が変わるため、完成前後でテーブルを分けず、`projects.status` で一連の状態を管理する設計にした。  
・複数動画を扱うため、プロジェクト本体と元動画を `projects` / `project_clips` に分けた。  
・workerの処理は非同期で失敗や再実行が起きるため、`processing_jobs` に実行履歴を残す設計にした。

▌projects /プロジェクトテーブル  
アプリ上の編集プロジェクト1つを表す。  
完成前も完成後もこのテーブルの1行で管理する。  
—index  
・device_id にindex  
・share_slug にunique index  
—

\- プロジェクトID id: uuid / primary key / not null / default gen_random_uuid()  
 プロジェクトを一意に識別するID。

\- スマホID device_id: uuid / not null  
 ログインなしで端末を識別するためのID。アプリ初回起動時に端末側で生成して使う想定。

\- タイトル title: text / nullable  
 ユーザーが付けた動画タイトル。未入力ならnull。

\- 説明 description: text / nullable  
完成動画の説明文。共有ページやアプリ内表示で使う。未入力の場合はnull。

\- 編集データ edit_config: jsonb / nullable  
 最終動画生成時に使う編集設定。選択した元動画、切り出し区間、並び順などを保存する。  
 完成後に不要なら削除してnullに戻してもよい。

\- ステータス status: project_status / not null / default 'draft'  
 プロジェクト全体の処理状態。  
 draft: 作成済み  
 uploading: アップロード中  
 uploaded: アップロード完了  
 preparing: 解析とmp4変換実行中  
 ready: 編集開始ok 解析とmp4が揃ってる  
 rendering: 結合処理中  
 completed: 完成  
 failed: 失敗

\- 共有用ID share_slug: text / unique / nullable  
 共有URLに使う推測困難なID。  
 例: https://example.com/s/{share\_slug}

\- アクセストークン access_token: text / not null  
ログインなしでプロジェクト操作権限を確認するための推測困難なトークン。

\- エラーフェーズ error_phase: text / nullable  
どの段階で失敗したか。  
upload: アップロード  
prepare: 解析・変換  
render: 完成動画生成  
publish: R2公開

\- エラーコード error_code: text / nullable  
 プロジェクト全体の処理に失敗した場合のエラー種別。  
 例: UPLOAD_FAILED, FFMPEG_FAILED, VIDEO_INTELLIGENCE_FAILED, R2_UPLOAD_FAILED

\- エラーメッセージ error_message: text / nullable  
 開発者や画面表示用のエラー説明。  
 例: FFmpeg conversion failed

\- 作成日時 created_at: timestamptz / not null / default now()  
 プロジェクトを作成した日時。

\- 更新日時 updated_at: timestamptz / not null / default now()  
 プロジェクト情報を最後に更新した日時。

\- 動画完成日時 completed_at: timestamptz / nullable  
 完成動画の生成が完了した日時。

▌project_clips / 元動画たち  
プロジェクトにアップロードされた元動画を管理する。  
複数動画を扱うので、1プロジェクトに対して複数行できる。

\- 元動画ID id: uuid / primary key / not null / default gen_random_uuid()  
 元動画を一意に識別するID。

\- プロジェクトID project_id: uuid / foreign key projects(id) / not null  
 どのプロジェクトに属する元動画かを表す。

\- 並び順 clip_index: integer / not null  
 ユーザーがアップロードした動画の順番。  
 最終動画生成時の初期順序にも使える。

\- 元ファイル名 original_filename: text / not null  
 ユーザーがアップロードした元動画のファイル名。

\- MIMEタイプ content_type: text / nullable  
 元動画のContent-Type。  
 例: video/mp4, video/quicktime

\- ファイルサイズ size_bytes: bigint / nullable  
 元動画のファイルサイズ。

\- 動画時間 duration_ms: integer / nullable  
 元動画の長さ。単位はミリ秒。

\- ステータス status: clip_status / not null / default 'uploading'  
 元動画ごとの処理状態。  
 uploading: アップロード中  
 uploaded: アップロード完了  
 processing: 解析・変換中  
 ready: 解析・変換完了  
 failed: 失敗

\- エラーコード error_code: text / nullable  
 この元動画の処理に失敗した場合のエラー種別。  
 例: GCS_OBJECT_NOT_FOUND, FFMPEG_FAILED, VIDEO_INTELLIGENCE_FAILED

\- エラーメッセージ error_message: text / nullable  
 この元動画の処理に失敗した理由の説明。

\- 作成日時 created_at: timestamptz / not null / default now()  
 元動画レコードを作成した日時。

\- 更新日時 updated_at: timestamptz / not null / default now()  
 元動画レコードを最後に更新した日時。

▌project_assets / ファイル管理  
GCSやR2に保存されたファイルを管理する。  
元動画、解析JSON、中間mp4、完成動画などをまとめて扱う。

\- アセットID id: uuid / primary key / not null / default gen_random_uuid()  
 保存ファイルを一意に識別するID。

\- プロジェクトID project_id: uuid / foreign key projects(id) / not null  
 どのプロジェクトに属するファイルかを表す。

\- 元動画ID clip_id: uuid / foreign key project_clips(id) / nullable  
 特定の元動画に紐づくファイルの場合に入れる。  
 完成動画のようにプロジェクト全体に紐づく場合はnull。

\- ファイル種別 kind: asset_kind / not null  
 original_clip: 元動画  
 converted_clip: mp4変換済みの中間動画  
 scene_candidates: アプリ表示用のシーン区間JSON  
 final_clip: 完成動画

\- 保存先 storage_provider: storage_provider / not null  
 gcs: Google Cloud Storage  
 r2: Cloudflare R2

\- バケット名 bucket: text / not null  
 保存先のバケット名。

\- オブジェクトキー object_key: text / not null  
 バケット内のファイルパス。  
 例: uploads/{project_id}/{clip_id}/original.mov

\- 公開URL public_url: text / nullable  
 公開配信する場合のURL。  
 R2上の完成動画やサムネイルでは値を入れる。  
 GCS上の元動画や解析JSONでは基本null。

\- MIMEタイプ content_type: text / nullable  
 ファイルのContent-Type。  
 例: video/mp4, image/jpeg

\- ファイルサイズ size_bytes: bigint / nullable  
 ファイルサイズ。

\- 作成日時 created_at: timestamptz / not null / default now()  
 ファイル情報を登録した日時。

▌processing_jobs / worker実行履歴  
Cloud Run Jobsで実行したworkerの履歴を管理する。  
失敗原因の確認や再実行に使う。

\- ジョブID id: uuid / primary key / not null / default gen_random_uuid()  
 worker実行を一意に識別するID。

\- プロジェクトID project_id: uuid / foreign key projects(id) / not null  
 どのプロジェクトに対するworker処理かを表す。

\- 元動画ID clip_id: uuid / foreign key project_clips(id) / nullable  
 特定の元動画に対する処理の場合に入れる。  
 最終動画生成のようにプロジェクト全体の処理ならnull。

\- ジョブ種別 job_type: job_type / not null  
 convert_clip: mp4変換処理  
 analyze_clip: Video Intelligence API解析処理  
 render_final: 完成動画生成処理  
 full_pipeline: 一連の処理をまとめたもの

\- ステータス status: job_status / not null / default 'queued'  
 workerの実行状態。  
 queued: 実行待ち  
 running: 実行中  
 succeeded: 成功  
 failed: 失敗

\- 試行回数 attempt: integer / not null / default 1  
 何回目の実行か。  
 再実行時に2, 3...と増やす。

\- Cloud Run実行名 cloud_run_execution_name: text / nullable  
 Cloud Run Jobs側のExecution名。  
 GCP上の実行ログとDBのジョブを対応させるために使う。

\- エラーコード error_code: text / nullable  
 worker処理に失敗した場合のエラー種別。  
 例:  
 GCS_OBJECT_NOT_FOUND: GCS上に元動画が存在しない  
 FFMPEG_FAILED: FFmpeg変換に失敗  
 VIDEO_INTELLIGENCE_FAILED: Video Intelligence APIの解析に失敗  
 R2_UPLOAD_FAILED: R2へのアップロードに失敗  
 DB_UPDATE_FAILED: DB更新に失敗

\- エラーメッセージ error_message: text / nullable  
 worker処理に失敗した理由の説明。

\- 開始日時 started_at: timestamptz / nullable  
 workerが実際に処理を開始した日時。

\- 終了日時 finished_at: timestamptz / nullable  
 workerが成功または失敗で終了した日時。

\- 作成日時 created_at: timestamptz / not null / default now()  
 ジョブレコードを作成した日時。

\- 更新日時 updated_at: timestamptz / not null / default now()  
 ジョブレコードを最後に更新した日時。

# エンドポイント

[SwaggerEditor](https://editor.swagger.io/) に/docs/api/openapi.jsonの中身をコピペすることで見やすく閲覧可能

▌POST /projects✅  
\- project作成  
\- status \= draft  
\- access_token返却

▌POST /projects/{projectId}/clips/upload-urls✅  
\- 動画のバリデーション  
\- 複数clip作成  
\- GCSアップロード用 signed URL発行  
\- project.status \= uploading

▌PUT GCS signed URL  
\- MobileがGCSへ直接アップロード

▌PUT /clips/{clipId}/upload-complete✅  
\- project idを探してaccess_tokenを照合  
\- clip単位でアップロード完了通知  
\- GCS object存在確認  
\- project_clips.status \= uploaded

▌POST /projects/{projectId}/prepare✅  
\- 全clipがuploadedならprepare worker起動  
\- project.status \= preparing

▌GET /projects/{projectId}✅  
\- status確認  
\- preparing中は clipsTotal / clipsReady を返す  
\- readyなら変換後mp4 URLとscene JSONを返す

▌POST /projects/{projectId}/render  
\- selectedScenes, title, descriptionを受け取る  
\- edit_config保存  
\- render worker起動  
\- project.status \= rendering

▌GET /projects/{projectId}  
\- rendering中は処理状態を返す  
\- completedならshareUrl / finalVideoUrlを返す

▌GET /share/{shareSlug}✅  
\- 共有URLから完成動画情報を取得する公開API  
\- access_tokenは要求しない  
\- projects.share_slugでprojectを検索する  
\- projects.statusがcompletedでない場合は404を返す（未完成であることを外部に漏らさないため）  
\- project_assets.kind \= final_clip のpublic_urlを返す  
\- projectId, title, description, videoUrlを返す  
\- ダウンロード用URLはこのAPIでは返さない。apps/web側が `/s/{shareSlug}/download` で動画をサーバーサイドfetchし、Content-Dispositionを付けて返す

▌DELETE /projects/{projectId}  
\- UIは未決定。アプリ側に過去の作成プロジェクト一覧を持たせ、削除ボタンと共有リンク(ブラウザに飛ぶ)があるイメージ。  
\- access_token 照合（不一致→403）  
\- R2の完成動画を削除  
\- DB行を物理削除（関連テーブルはFK CASCADE）  
\- GCSの中間ファイルはライフサイクルルールに任せる（APIでは触らない）  
\- ステータス204 を返す

# バックエンドディレクトリ構成

app/  
 domain/  
 project.py \# Project entity, status遷移ルール  
 clip.py \# Clip entity, clip_status遷移  
 scene.py \# Scene, Cut（値オブジェクト）  
 edit_config.py \# EditConfig（値オブジェクト）  
 error.py \# ドメイン例外（PrepareNotAllowedError等）  
 usecase/  
 create_project.py  
 request_upload_urls.py  
 complete_upload.py  
 start_prepare.py  
 start_render.py  
 get_project_status.py  
 infra/  
 db/  
 models.py \# SQLAlchemy models  
 repository.py \# ProjectRepo, ClipRepo, AssetRepo  
 storage/  
 gcs.py  
 r2.py  
 video/  
 intelligence.py \# Video Intelligence APIラッパー  
 ffmpeg.py \# FFmpegラッパー  
 api/  
 routes/  
 projects.py  
 clips.py  
 dependencies.py \# FastAPI Depends（repo, storage等の注入）  
 main.py  
 worker/  
 prepare.py \# prepare job エントリポイント  
 render.py \# render job エントリポイント  
 pipeline.py \# 共通パイプラインユーティリティ(ログ, エラーハンドリング)

# データの受け渡し

▌共通規約  
\- 時間はすべて整数ミリ秒(Ms)。秒の小数は使わない(浮動小数の誤差・累積ズレを避けるため)  
\- 位置は正規化座標(0.0〜1.0)。ピクセル絶対値は使わない(解像度非依存にして、変換後mp4の解像度が変わっても破綻させないため)  
\- startMs, endMs は「変換後動画(mp4)」を基準にする。

▌シーン解析データ（サーバー → クライアント）

\`GET /projects/{projectId}\` が \`status \= ready\` のとき返す本体。

\`\`\`jsonc  
{  
 "projectId": "uuid",  
 "status": "ready",  
 "clips": \[  
 {  
 "clipId": "uuid", // どの元動画か  
 "clipIndex": 0, // アップロード順  
 "durationMs": 45200, // 変換後mp4の長さ  
 "width": 1080, // 編集で表示サイズトリミングできるように  
 "height": 1920, // 編集で表示サイズトリミングできるように  
 "video": { // プレビュー再生用  
 "url": "https://...signed...",  
 "expiresAt": "2026-06-20T13:00:00Z"  
 },  
 "scenes": \[  
 {  
 "sceneId": "uuid",  
 "sceneIndex": 0, // 表示順としての連番は別に持つ  
 "startMs": 0,  
 "endMs": 3200,  
 "labels": \["beach", "boat", "house"\],  
 }  
 \]  
 }  
 \]  
}  
\`\`\`

\- 画面２（シーン選択画面）で表示するサムネイルは一旦クライアントが \`expo-video-thumbnails\` で生成してみる。ダメそうだったら要素足すかも。

\---

▌編集データ （クライアント → サーバー）

\`POST /projects/{projectId}/render\` のリクエストボディ。

\`\`\`jsonc  
{  
 "editConfig": {  
 "version": 1,  
 "output": {  
 "aspectRatio": "9:16", // 9:16 | 1:1 | 3:4 | 4:5 | 16:9  
 "width": 1080,  
 "height": 1920,  
 "fps": 30  
 },  
 "timeline": \[  
 {  
 "cutId": "client-uuid", // ★ クライアント生成。編集画面で複製した場合１シーンに２カット以上になるため  
 "order": 0, // カットの順序  
 "clipId": "uuid",  
 "startMs": 1000,  
 "endMs": 3500,  
 "transform": { // 画面表示サイズ  
 "zoom": 1.4, // 拡大率（1.0で出力の縦横比を保ったまま、元フレームに収まる最大範囲）  
 "offsetX": 0.1, // 中央からのずれ（正規化座標）  
 "offsetY": \-0.05 // 中央からのずれ（正規化座標）  
 },  
 "transitionToNext": { // 次の動画にかけてのトランジション  
 "type": "fade", // none | fade  
 "durationMs": 400 // ▲ トランジションの長さ設定いらない気もする  
 }  
 }  
 \]  
 }  
}  
\`\`\`

\- 各cutは「\`clipId\` の変換後mp4を \`startMs〜endMs\` で切り出し → \`transform\` のサイズに調整 → \`output\` 解像度に整形 → 次cutへ \`transition\`」。  
\- 同一シーンを2回使う複製は、同じ \`clipId\` で \`cutId\` が異なる。

# ルーティング構成

src/app/  
　\_layout.tsx … 全体のProvider(TanStack Query)・Stack定義  
　index.tsx …プロジェクト作成画面に遷移  
　project/  
　　create.tsx … 1\. プロジェクト作成画面  
　　\[id\]/  
　　　 \_layout.tsx  
　　　scenes.tsx … 2\. シーン選択画面  
　　　editor.tsx … 3\. 編集(タイムライン)画面  
　　　cut/\[cutId\].tsx … 4\. 編集(カット編集)画面  
　　　output.tsx … 5\. 出力設定画面  
　　　done.tsx … 6\. 出力完了画面

# Web版（共有閲覧ページ）

▌対象範囲

共有URL（`/s/{share_slug}`）の閲覧専用ページ。動画再生・全画面・タイトル/説明表示・OGP。削除等の操作はRNアプリ側に寄せる。

▌技術スタック

・フレームワーク：Hono → 軽量・JSX SSRでOGP動的生成・Workers相性◎・TS/JSX知識が活きる

・実行環境：Cloudflare Workers → R2と同一圏でバインディング直結、エッジで低コスト

・ビルド：Vite（cloudflare-workers+vite 公式テンプレ）→ Tailwindを本番purgeで使うため必要、HMR、構成が用意済み

・レンダリング：JSX SSR → slug毎の動的OGPに必須、閲覧専用でSSR向き

・スタイリング：Tailwind CSS → Vite統合で手早く組める

・動画ストレージ：Cloudflare R2 → 既存踏襲、エグレス無料、配信/OGP/エッジを集約

▌役割分担

・GCP：API（Cloud Run）、worker（Cloud Run Jobs）、GCS、Video Intelligence API

・Cloudflare：完成動画配信（R2）＋共有閲覧Web（Workers \+ Hono）

▌設計判断

・[Next.js](http://Next.js)不採用：この1画面にはRSC/ルーティング/キャッシュが過剰、統一方針ともズレる

・SPA不採用：初期HTMLが空で動的OGPが弱い

・削除をWebに置かない：公開URLで本人判別不可。削除はaccess_token保持のRNアプリからのみ

・Hono単体（Vite無し）不採用：Tailwind本番利用にビルドが要る。Viteテンプレの方が楽

・スタイリング：実質Tailwindか素CSSの2択。CSS-in-JSはSSR/Workers相性で除外、UnoCSSは情報量でTailwind優先
