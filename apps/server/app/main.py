from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.routes import videos
from dotenv import load_dotenv

load_dotenv()
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()

app.include_router(videos.router)

app.mount("/", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")
