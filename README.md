# Vlog Scene Cutter

長回し旅行動画から「意味的な切り替わり点」を検出し、各シーン内の好きな位置から
定数秒を切り出すツール。

## セットアップ
```bash
pip install -r requirements.txt
# ffmpeg をインストールして PATH を通す
# GCP認証: gcloud auth application-default login など
```

## 使い方
```bash
# 1. 解析 (10分超の動画はGCS経由を推奨)
python analyze.py --video movies/1.mov --bucket YOUR_BUCKET --out out

# パラメータ調整時はAPIを再課金せずキャッシュを使う
python analyze.py --video movies/1.mov --out out --use-cache --sensitivity 1.3

# 2. UI起動
streamlit run app.py -- --out out
```

## 主なパラメータ (analyze.py)
- `--win`        前後比較ウィンドウ秒数 (default 15)。転換が緩やかなら大きく
- `--min-scene`  最小シーン長秒 (default 20)
- `--sensitivity` 0.5(候補少)〜1.5(候補多) (default 1.0)

## 毎回の起動手順 (Windows PowerShell)

```powershell
# 1. 仮想環境をアクティベート (セッション開始時に毎回実行)
cd C:\Users\suiso\fmi\HMI2026
.\.venv\Scripts\Activate.ps1

# 2. 動画解析 (初回 or 動画を変えるとき。GCP課金が発生する)
python analyze.py --video movies/1.mov --bucket YOUR_BUCKET --out out

# キャッシュ再利用でパラメータ調整 (再課金なし)
python analyze.py --video movies/1.mov --out out --use-cache --sensitivity 1.3

# 3. UI起動
streamlit run app.py -- --out out
```

> **注意**: `.venv\Scripts\Activate.ps1` が弾かれる場合は実行ポリシーを確認。
> 現在の設定 (RemoteSigned) では通常そのまま実行できる。
> もし弾かれたら: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
