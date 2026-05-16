from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    backend_host: str = "127.0.0.1"
    backend_port: int = 8765
    ollama_url: str = "http://localhost:11434"
    chunk_size: int = 800
    chunk_overlap: int = 100


def get_config() -> Config:
    return Config(
        backend_host=os.getenv("MICROSLOP_BACKEND_HOST", "127.0.0.1"),
        backend_port=int(os.getenv("MICROSLOP_BACKEND_PORT", "8765")),
        ollama_url=os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
    )
