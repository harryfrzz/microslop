from __future__ import annotations

from fastapi import APIRouter

from app.core.config import get_config
from app.core.paths import app_data_dir
from app.core.settings import get_app_settings, update_app_settings
from app.schemas.settings import Settings

router = APIRouter()


@router.get("/settings")
def get_settings():
    settings = get_app_settings()
    settings["backendUrl"] = f"http://{get_config().backend_host}:{get_config().backend_port}"
    settings["storagePath"] = str(app_data_dir())
    return settings


@router.post("/settings")
def post_settings(settings: Settings):
    payload = settings.dict() if hasattr(settings, "dict") else settings.model_dump()
    payload.pop("backendUrl", None)
    updated = update_app_settings(payload)
    updated["backendUrl"] = f"http://{get_config().backend_host}:{get_config().backend_port}"
    updated["storagePath"] = str(app_data_dir())
    return updated
