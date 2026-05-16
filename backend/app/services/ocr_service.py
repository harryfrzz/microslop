from __future__ import annotations

import shutil
from typing import Optional

from PIL import Image
import pytesseract


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def extract_text(image_path: str) -> tuple[str, Optional[str]]:
    if not tesseract_available():
        return "", "Tesseract is not installed. Install it with `brew install tesseract` on macOS."
    try:
        with Image.open(image_path) as image:
            return pytesseract.image_to_string(image), None
    except Exception as exc:
        return "", str(exc)
