from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.settings import get_app_settings
from app.db.sqlite_db import get_snapshots
from app.schemas.search import AnswerRequest, SearchRequest
from app.services.llm_service import generate_answer
from app.services.search_service import search_memories

router = APIRouter()


@router.post("/search")
def search(request: SearchRequest):
    filters = request.filters.dict() if hasattr(request.filters, "dict") else request.filters.model_dump()
    try:
        return {"results": search_memories(request.query, request.mode, request.topK, filters)}
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/answer")
def answer(request: AnswerRequest):
    settings = get_app_settings()
    memories = get_snapshots(request.memoryIds)
    try:
        return {"answer": generate_answer(request.question, memories, settings["cerebrasModel"]), "status": "ok"}
    except Exception as exc:
        return {"answer": "", "status": "error", "error": str(exc)}
