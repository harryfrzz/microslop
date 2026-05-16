from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_capture import router as capture_router
from app.api.routes_privacy import router as privacy_router
from app.api.routes_search import router as search_router
from app.api.routes_settings import router as settings_router
from app.api.routes_status import router as status_router
from app.core.config import get_config
from app.db.migrations import run_migrations

config = get_config()
run_migrations()

app = FastAPI(title="microslop local memory", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "file://"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(status_router)
app.include_router(capture_router)
app.include_router(search_router)
app.include_router(settings_router)
app.include_router(privacy_router)
