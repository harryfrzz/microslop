from __future__ import annotations

import requests

from app.core.config import get_config

SYSTEM_PROMPT = """You are a local memory assistant. Answer the user using only the retrieved screen memories. Each memory includes timestamp, app name, window title, OCR text, and screenshot reference. Do not invent details. If the memories are not enough, say you could not find enough information. When useful, mention the timestamp and app/window where the information appeared.
The answer should cite local memories by timestamp, for example:
I found this around 11:42 AM in Chrome, window title “Gemma docs”.
Do not use external citations."""


def check_ollama_health() -> bool:
    try:
        response = requests.get(f"{get_config().ollama_url}/api/tags", timeout=2)
        return response.ok
    except requests.RequestException:
        return False


def model_available(model: str) -> bool:
    try:
        response = requests.get(f"{get_config().ollama_url}/api/tags", timeout=3)
        response.raise_for_status()
        names = [item.get("name") for item in response.json().get("models", [])]
        return model in names
    except requests.RequestException:
        return False


def embed_text(text: str, model: str) -> list[float]:
    cfg = get_config()
    responses = []
    endpoints = [
        ("/api/embeddings", {"model": model, "prompt": text}),
        ("/api/embed", {"model": model, "input": text}),
    ]
    for endpoint, payload in endpoints:
        try:
            response = requests.post(f"{cfg.ollama_url}{endpoint}", json=payload, timeout=60)
        except requests.RequestException as exc:
            responses.append(str(exc))
            continue
        if not response.ok:
            responses.append(response.text)
            continue
        data = response.json()
        embeddings = data.get("embeddings") or data.get("embedding")
        if embeddings and isinstance(embeddings[0], list):
            return embeddings[0]
        if embeddings:
            return embeddings
        responses.append(f"{endpoint} returned no embedding")

    details = " ".join(responses)
    if "not found" in details and model in details:
        raise RuntimeError(f"Ollama embedding model `{model}` is not available. Install it with `ollama pull {model}` or set a different text embedding model in Settings.")
    raise RuntimeError(f"Ollama could not create an embedding with model `{model}`. {details}".strip())


def generate_answer_with_gemma(question: str, memories: list[dict], model: str) -> str:
    if not model_available(model):
        raise RuntimeError(f"Ollama model `{model}` is not available. Install it or set the correct local model name in Settings.")
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
        f"{get_config().ollama_url}/api/chat",
        json={
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nRetrieved memories:\n\n" + "\n\n---\n\n".join(context_parts)},
            ],
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.json().get("message", {}).get("content", "")
