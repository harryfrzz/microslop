from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.settings import set_capture_enabled
from app.services.retention_service import delete_range, delete_since, delete_today

router = APIRouter(prefix="/privacy")


class DeleteRangeRequest(BaseModel):
    dateFrom: Optional[str] = None
    dateTo: Optional[str] = None


@router.post("/delete-range")
def route_delete_range(request: DeleteRangeRequest):
    return {"deleted": delete_range(request.dateFrom, request.dateTo)}


@router.post("/delete-all")
def route_delete_all():
    return {"deleted": delete_range(None, None)}


@router.post("/delete-last-15-minutes")
def route_delete_last_15():
    return {"deleted": delete_since(timedelta(minutes=15))}


@router.post("/delete-last-hour")
def route_delete_last_hour():
    return {"deleted": delete_since(timedelta(hours=1))}


@router.post("/delete-today")
def route_delete_today():
    return {"deleted": delete_today()}


@router.post("/pause")
def pause():
    return set_capture_enabled(False)


@router.post("/resume")
def resume():
    return set_capture_enabled(True)
