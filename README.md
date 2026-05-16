# microslop

microslop is a local-first Copilot Recall-style desktop memory MVP. The Electron app captures screen snapshots, sends them to a local FastAPI backend, extracts OCR with Tesseract, embeds text with Ollama `nomic-embed-text`, stores vectors in LanceDB, stores metadata in SQLite, and answers questions with Gemma through Ollama.

No cloud APIs are used. Screenshots, OCR text, embeddings, metadata, search results, and generated answers stay on your machine.

## Architecture

```text
Electron + React + TypeScript
  capture controls, screenshot capture, desktop UI
    ↓
FastAPI at http://127.0.0.1:8765
  OCR, inference, embeddings, ranking, privacy, storage
    ↓
Tesseract OCR
    ↓
Ollama nomic-embed-text + Python CLIP ViT-B/32
    ↓
SQLite metadata + LanceDB vectors + local screenshot files
    ↓
Hybrid search + Gemma 4 E2B grounded answers through Ollama
```

## Local Storage

```text
app-data/
  memory.sqlite
  lancedb/
    text_memories/
    image_memories/
  screenshots/
    YYYY-MM-DD/
  thumbnails/
    YYYY-MM-DD/
```

The app exposes the storage location in Settings and Privacy. Delete controls remove SQLite records, LanceDB vectors, screenshots, and thumbnails.

## One-command Setup

```bash
./setup.sh
```

The setup script installs Tesseract and Ollama when possible, creates the backend Python virtualenv, installs backend and frontend dependencies, starts `ollama serve`, pulls `nomic-embed-text` and `gemma4:e2b`, starts the FastAPI backend, and launches the Electron app.

You can override defaults with environment variables:

```bash
MICROSLOP_BACKEND_PORT=8765 OLLAMA_MODEL=gemma4:e2b TEXT_EMBEDDING_MODEL=nomic-embed-text ./setup.sh
```

## Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8765 --reload
```

## Tesseract Setup

```bash
brew install tesseract
```

Ubuntu/Debian:

```bash
sudo apt install tesseract-ocr
```

## Ollama Setup

```bash
ollama serve
ollama pull gemma4:e2b
ollama pull nomic-embed-text
```

If `gemma4:e2b` is not available in your Ollama setup, use the model name installed locally and update it in Settings.

## Frontend Setup

```bash
npm install
npm run dev
```

## Screen Recording Permission

On macOS, grant Screen Recording permission to the terminal or packaged app running Electron. If permission is missing, manual and automatic capture can fail or produce empty captures.

## Development Flow

1. Start Ollama and pull the local models.
2. Start the FastAPI backend from `backend/`.
3. Start the Electron app with `npm run dev`.
4. Open Dashboard and confirm SQLite, LanceDB, Ollama, and OCR status.
5. Click Start capture or Capture now.
6. Search with natural language and optionally generate a grounded Gemma answer.

## Build

```bash
npm run package
npm run make
```

## Privacy Controls

Capture can be paused globally. Default exclusions include password managers, banking, private/incognito windows, login, OTP, and authentication keywords. Privacy controls can delete the last 15 minutes, last hour, today, or all local memory data.
