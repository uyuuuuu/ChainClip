from __future__ import annotations

from dotenv import load_dotenv

# app.infra.storage.gcs はimport時にstorage.Client()を生成し、
# GOOGLE_APPLICATION_CREDENTIALS等の環境変数を要求する。
# usecase層のテストはDB不要でmake test-unitのみでも動く想定のため、
# pytest収集前にここで.envを読み込む。
load_dotenv()
