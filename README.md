# memories

> ⚠️ Under active development.

A local-first, Recall-style desktop memory app. Captures screen snapshots, runs OCR, embeds text locally, and answers questions over your own history. Everything stays on your machine except optional LLM answer generation (bring your own key).

## Stack

Electron + React + TypeScript · FastAPI · Tesseract OCR · `BAAI/bge-small-en-v1.5` embeddings · LanceDB vectors · SQLite metadata · OpenAI-compatible LLM for grounded answers.

## Setup

```bash
chmod +x setup.sh
./setup.sh
```

Installs Tesseract, creates the backend virtualenv, installs deps, starts the FastAPI backend (`http://127.0.0.1:8765`), and launches the Electron app. Keep the terminal open; `Ctrl+C` stops everything.

Add your LLM provider Base URL + API key in **Settings → Models**, then Fetch models. No key needed to capture, search, or browse — those run fully local.

## Privacy

Capture can be paused globally. Default exclusions cover password managers, banking, incognito windows, and auth/OTP keywords. You can delete the last 15 min, last hour, today, or all data. Storage location is shown in Settings.

## Manual setup

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8765 --reload

# frontend
npm install && npm run dev
```

> macOS: grant Screen Recording permission to the terminal/app running Electron, or captures may be empty.
