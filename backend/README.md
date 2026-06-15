# microslop local backend

FastAPI service for local screenshot memory indexing and search. It owns OCR, embeddings, SQLite metadata, LanceDB vectors, ranking, privacy deletion, and answer generation through the Cerebras inference API.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8765 --reload
```

## Tesseract

```bash
# macOS
brew install tesseract

# Ubuntu/Debian
sudo apt install tesseract-ocr
```

## LLM (Cerebras)

Answers run on the Cerebras inference API. Export your key before starting:

```bash
export CEREBRAS_API_KEY=csk-...
```

Model defaults to `llama-3.3-70b` (override via Settings or `CEREBRAS_MODEL`). Text embeddings use `BAAI/bge-small-en-v1.5` via sentence-transformers, downloaded automatically on first use.

## Data

By default data is stored in `../app-data` when the backend is launched from `backend/`.

```text
app-data/
  memory.sqlite
  lancedb/
  screenshots/YYYY-MM-DD/
  thumbnails/YYYY-MM-DD/
```

Set `MICROSLOP_DATA_DIR` to override the storage location. Set `MICROSLOP_BACKEND_PORT` if your local port differs, and `CEREBRAS_API_KEY` / `CEREBRAS_MODEL` / `CEREBRAS_URL` to configure the LLM.
