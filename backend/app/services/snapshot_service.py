from __future__ import annotations

import shutil
import uuid
from typing import Optional

from app.core.config import get_config
from app.core.paths import dated_dir, screenshots_dir, thumbnails_dir
from app.core.settings import get_app_settings
from app.db.sqlite_db import insert_snapshot, insert_text_chunk, utc_now
from app.services.duplicate_detection import file_hash, is_duplicate
from app.services.image_embedding_service import embed_image
from app.services.lancedb_service import add_image_memory, add_text_memories, text_row
from app.services.ocr_service import extract_text
from app.services.privacy_filter import is_excluded
from app.services.text_embedding_service import chunk_text, embed_chunks
from app.services.thumbnail_service import create_thumbnail


def index_snapshot(source_path: str, timestamp: str, app_name: Optional[str], window_title: Optional[str], screen_hash: Optional[str]) -> dict:
    settings = get_app_settings()
    if not settings.get("captureEnabled", False):
        return {"status": "skipped", "error": "Capture is paused"}
    excluded, reason = is_excluded(app_name, window_title)
    if excluded:
        return {"status": "skipped", "error": reason}

    snapshot_id = str(uuid.uuid4())
    ext = ".png"
    target = dated_dir(screenshots_dir(), timestamp) / f"{snapshot_id}{ext}"
    shutil.copyfile(source_path, target)
    actual_hash = screen_hash or file_hash(str(target))
    if is_duplicate(actual_hash):
        target.unlink(missing_ok=True)
        return {"status": "skipped", "error": "Duplicate screenshot"}

    thumb = dated_dir(thumbnails_dir(), timestamp) / f"{snapshot_id}.jpg"
    try:
        create_thumbnail(str(target), str(thumb))
        thumbnail_path = str(thumb)
    except Exception:
        thumbnail_path = None

    ocr_text = ""
    ocr_error = None
    ocr_status = "disabled"
    if settings.get("enableOCR", True):
        ocr_text, ocr_error = extract_text(str(target))
        ocr_status = "failed" if ocr_error else "success"

    snapshot = {
        "id": snapshot_id,
        "timestamp": timestamp,
        "screenshotPath": str(target),
        "thumbnailPath": thumbnail_path,
        "appName": app_name or "",
        "windowTitle": window_title or "",
        "screenHash": actual_hash,
        "ocrText": ocr_text,
        "ocrStatus": ocr_status,
        "ocrError": ocr_error,
        "imageEmbeddingStatus": "disabled" if not settings.get("enableImageEmbeddings", True) else "pending",
        "createdAt": utc_now(),
    }

    chunks = chunk_text(ocr_text, get_config().chunk_size, get_config().chunk_overlap)
    text_rows = []
    if chunks:
        try:
            embeddings = embed_chunks(chunks, settings["textEmbeddingModel"])
            for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                insert_text_chunk({"id": str(uuid.uuid4()), "snapshotId": snapshot_id, "chunkText": chunk, "chunkIndex": index, "createdAt": utc_now()})
                text_rows.append(text_row(snapshot, chunk, embedding))
            add_text_memories(text_rows)
        except Exception as exc:
            ocr_error = f"Text embedding failed: {exc}"
            snapshot["ocrError"] = (snapshot.get("ocrError") or "") + " " + ocr_error

    if settings.get("enableImageEmbeddings", True):
        try:
            image_embedding = embed_image(str(target), settings["imageEmbeddingModel"])
            add_image_memory(
                {
                    "id": str(uuid.uuid4()),
                    "snapshotId": snapshot_id,
                    "screenshotPath": str(target),
                    "thumbnailPath": thumbnail_path or "",
                    "embedding": image_embedding,
                    "timestamp": timestamp,
                    "appName": app_name or "",
                    "windowTitle": window_title or "",
                    "imageHash": actual_hash,
                }
            )
            snapshot["imageEmbeddingStatus"] = "success"
        except Exception as exc:
            snapshot["imageEmbeddingStatus"] = "failed"
            snapshot["ocrError"] = ((snapshot.get("ocrError") or "") + f" Image embedding failed: {exc}").strip()

    insert_snapshot(snapshot)
    return {
        "status": "indexed",
        "snapshotId": snapshot_id,
        "ocrStatus": snapshot["ocrStatus"],
        "textChunks": len(text_rows),
        "imageEmbeddingStatus": snapshot["imageEmbeddingStatus"],
        "error": snapshot.get("ocrError"),
    }
