from __future__ import annotations

import requests

from app.core.config import get_config

SYSTEM_PROMPT = """You are a local memory assistant. Answer the user using only the retrieved screen memories. Each memory includes timestamp, app name, window title, OCR text, and screenshot reference. Do not invent details. If the memories are not enough, say you could not find enough information. When useful, mention the timestamp and app/window where the information appeared.
The answer should cite local memories by timestamp, for example:
I found this around 11:42 AM in Chrome, window title “Gemma docs”.
Do not use external citations."""


def llm_available(model: str) -> bool:
    return bool(get_config().cerebras_api_key)


def check_llm_health() -> bool:
    cfg = get_config()
    if not cfg.cerebras_api_key:
        return False
    try:
        response = requests.get(
            f"{cfg.cerebras_url}/models",
            headers={"Authorization": f"Bearer {cfg.cerebras_api_key}"},
            timeout=5,
        )
        return response.ok
    except requests.RequestException:
        return False


def generate_answer(question: str, memories: list[dict], model: str) -> str:
    cfg = get_config()
    if not cfg.cerebras_api_key:
        raise RuntimeError(
            "Cerebras API key is not set. Export CEREBRAS_API_KEY before starting the backend."
        )
    context_parts = []
    for memory in memories:
        context_parts.append(
            f"Timestamp: {memory.get('timestamp')}\n"
            f"App: {memory.get('appName') or 'Unknown'}\n"
            f"Window: {memory.get('windowTitle') or 'Unknown'}\n"
            f"Screenshot: {memory.get('screenshotPath')}\n"
            f"OCR text:\n{memory.get('ocrText') or ''}"
        )
    response = requests.post(
        f"{cfg.cerebras_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {cfg.cerebras_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model or cfg.cerebras_model,
            "temperature": 0.2,
            "stream": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nRetrieved memories:\n\n" + "\n\n---\n\n".join(context_parts)},
            ],
        },
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Cerebras request failed ({response.status_code}): {response.text}")
    return response.json()["choices"][0]["message"]["content"]
