# HMI2026

- gcloud CLIを入れる
- `gcloud init`してログイン
- プロジェクト番号を選ぶ
- API有効化`gcloud services enable videointelligence.googleapis.com`
- `gcloud auth application-default login`
- `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`
- venv作成 `python -m venv .venv`
- activateする
- `python -m pip install --upgrade pip`
- `pip install google-cloud-videointelligence`
- `src`フォルダなどに動画を入れる(mov or mp4)
- `python main.py src/XXX.mov --out scenes.json`
