from __future__ import annotations

from pydantic import BaseModel
from typing import Optional


class SearchFilters(BaseModel):
    dateFrom: Optional[str] = None
    dateTo: Optional[str] = None
    appName: Optional[str] = None
    windowTitle: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    mode: str = "hybrid"
    topK: int = 10
    filters: SearchFilters = SearchFilters()


class AnswerRequest(BaseModel):
    question: str
    memoryIds: list[str]
