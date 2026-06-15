from __future__ import annotations

from fastapi import APIRouter

from app.db.sqlite_db import ping as sqlite_ping, stats
from app.services.lancedb_service import ping as lancedb_ping
from app.services.ocr_service import tesseract_available
from app.services.llm_service import check_llm_health

router = APIRouter()


def _ok(check) -> str:
    try:
        return "ok" if check() else "error"
    except Exception:
        return "error"


@router.get("/status")
def status():
    return {
        "backend": "ok",
        "sqlite": _ok(sqlite_ping),
        "lancedb": _ok(lancedb_ping),
        "llm": _ok(check_llm_health),
        "ocr": "ok" if tesseract_available() else "error",
        "captureStats": stats(),
    }
