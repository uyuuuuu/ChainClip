from app.api.routes import projects
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://editor.swagger.io",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
