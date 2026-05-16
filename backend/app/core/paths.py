from __future__ import annotations

from pathlib import Path
import os


def app_data_dir() -> Path:
    configured = os.getenv("MICROSLOP_DATA_DIR")
    root = Path(configured).expanduser() if configured else Path.cwd().parent / "app-data"
    root.mkdir(parents=True, exist_ok=True)
    return root


def sqlite_path() -> Path:
    return app_data_dir() / "memory.sqlite"


def lancedb_path() -> Path:
    path = app_data_dir() / "lancedb"
    path.mkdir(parents=True, exist_ok=True)
    return path


def screenshots_dir() -> Path:
    path = app_data_dir() / "screenshots"
    path.mkdir(parents=True, exist_ok=True)
    return path


def thumbnails_dir() -> Path:
    path = app_data_dir() / "thumbnails"
    path.mkdir(parents=True, exist_ok=True)
    return path


def dated_dir(base: Path, timestamp: str) -> Path:
    day = timestamp[:10]
    path = base / day
    path.mkdir(parents=True, exist_ok=True)
    return path
