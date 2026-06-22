from app.api.routes import clips, projects
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from app.domain.error import (
    AccessDeniedError,
    InvalidClipError,
    InvalidProjectStateError,
    ProjectNotFoundError,
)

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


@app.exception_handler(ProjectNotFoundError)
async def handle_project_not_found(request: Request, exc: ProjectNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(AccessDeniedError)
async def handle_access_denied(request: Request, exc: AccessDeniedError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(InvalidProjectStateError)
async def handle_invalid_project_state(request: Request, exc: InvalidProjectStateError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(InvalidClipError)
async def handle_invalid_clip(request: Request, exc: InvalidClipError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


app.include_router(projects.router)
app.include_router(clips.router)
