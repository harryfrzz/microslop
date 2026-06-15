from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    backend_host: str = "127.0.0.1"
    backend_port: int = 8765
    cerebras_api_key: str = ""
    cerebras_url: str = "https://api.cerebras.ai/v1"
    cerebras_model: str = "llama-3.3-70b"
    chunk_size: int = 800
    chunk_overlap: int = 100


def get_config() -> Config:
    return Config(
        backend_host=os.getenv("MICROSLOP_BACKEND_HOST", "127.0.0.1"),
        backend_port=int(os.getenv("MICROSLOP_BACKEND_PORT", "8765")),
        cerebras_api_key=os.getenv("CEREBRAS_API_KEY", ""),
        cerebras_url=os.getenv("CEREBRAS_URL", "https://api.cerebras.ai/v1").rstrip("/"),
        cerebras_model=os.getenv("CEREBRAS_MODEL", "llama-3.3-70b"),
    )
