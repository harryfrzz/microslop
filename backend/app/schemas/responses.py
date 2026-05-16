from __future__ import annotations

from pydantic import BaseModel


class StatusResponse(BaseModel):
    backend: str
    sqlite: str
    lancedb: str
    ollama: str
    ocr: str
    captureStats: dict
