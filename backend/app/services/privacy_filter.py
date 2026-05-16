from __future__ import annotations

import re
from typing import Optional

from app.core.settings import get_app_settings


def is_excluded(app_name: Optional[str], window_title: Optional[str]) -> tuple[bool, Optional[str]]:
    settings = get_app_settings()
    app = app_name or ""
    title = window_title or ""
    for excluded in settings.get("excludedApps", []):
        if excluded and excluded.lower() in app.lower():
            return True, f"Excluded app matched: {excluded}"
    for pattern in settings.get("excludedWindowTitlePatterns", []):
        if not pattern:
            continue
        try:
            if re.search(pattern, title, re.IGNORECASE):
                return True, f"Excluded window pattern matched: {pattern}"
        except re.error:
            if pattern.lower() in title.lower():
                return True, f"Excluded window keyword matched: {pattern}"
    return False, None
