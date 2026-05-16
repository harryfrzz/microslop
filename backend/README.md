# microslop local backend

FastAPI service for local screenshot memory indexing and search. It owns OCR, embeddings, SQLite metadata, LanceDB vectors, ranking, privacy deletion, and Ollama answer generation.

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

## Ollama

```bash
ollama serve
ollama pull gemma4:e2b
ollama pull nomic-embed-text
```

If `gemma4:e2b` is not available in your Ollama setup, install the local model you want and update the model name in Settings.

## Data

By default data is stored in `../app-data` when the backend is launched from `backend/`.

```text
app-data/
  memory.sqlite
  lancedb/
  screenshots/YYYY-MM-DD/
  thumbnails/YYYY-MM-DD/
```

Set `MICROSLOP_DATA_DIR` to override the storage location. Set `MICROSLOP_BACKEND_PORT` or `OLLAMA_URL` if your local ports differ.
