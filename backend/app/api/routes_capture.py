from __future__ import annotations

import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile

from app.services.snapshot_service import index_snapshot

router = APIRouter(prefix="/capture")


@router.post("/index")
async def capture_index(
    screenshot: Optional[UploadFile] = File(default=None),
    screenshotPath: Optional[str] = Form(default=None),
    timestamp: str = Form(...),
    appName: Optional[str] = Form(default=""),
    windowTitle: Optional[str] = Form(default=""),
    screenHash: Optional[str] = Form(default=None),
):
    temp_path = None
    source = screenshotPath
    if screenshot is not None:
        suffix = os.path.splitext(screenshot.filename or "capture.png")[1] or ".png"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await screenshot.read())
            temp_path = tmp.name
            source = temp_path
    if not source:
        return {"status": "failed", "error": "Provide screenshot upload or screenshotPath"}
    try:
        return index_snapshot(source, timestamp, appName, windowTitle, screenHash)
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
