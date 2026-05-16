from __future__ import annotations

from PIL import Image


def create_thumbnail(source_path: str, target_path: str) -> None:
    with Image.open(source_path) as image:
        image.thumbnail((420, 260))
        image.save(target_path, "JPEG", quality=82)
