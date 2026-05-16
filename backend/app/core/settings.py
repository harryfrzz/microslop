from __future__ import annotations

from app.db.sqlite_db import get_setting, set_setting, list_exclusions, replace_exclusions

DEFAULT_EXCLUSIONS = [
    "1Password",
    "Bitwarden",
    "KeePass",
    "LastPass",
    "Bank",
    "Banking",
    "Password",
    "Private Browsing",
    "Incognito",
    "Login",
    "OTP",
    "Authentication",
]

DEFAULT_SETTINGS = {
    "captureEnabled": False,
    "captureIntervalSeconds": 5,
    "retentionDays": 30,
    "ollamaModel": "gemma4:e2b",
    "textEmbeddingModel": "nomic-embed-text",
    "imageEmbeddingModel": "sentence-transformers/clip-ViT-B-32",
    "enableOCR": True,
    "enableImageEmbeddings": True,
}


def get_app_settings() -> dict:
    settings = {key: get_setting(key, value) for key, value in DEFAULT_SETTINGS.items()}
    exclusions = list_exclusions()
    settings["excludedApps"] = exclusions["apps"] or DEFAULT_EXCLUSIONS[:4]
    settings["excludedWindowTitlePatterns"] = exclusions["patterns"] or DEFAULT_EXCLUSIONS[4:]
    return settings


def update_app_settings(payload: dict) -> dict:
    for key in DEFAULT_SETTINGS:
        if key in payload:
            set_setting(key, payload[key])
    if "excludedApps" in payload or "excludedWindowTitlePatterns" in payload:
        current = get_app_settings()
        replace_exclusions(
            payload.get("excludedApps", current["excludedApps"]),
            payload.get("excludedWindowTitlePatterns", current["excludedWindowTitlePatterns"]),
        )
    return get_app_settings()


def set_capture_enabled(enabled: bool) -> dict:
    set_setting("captureEnabled", enabled)
    return get_app_settings()
