#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_HOST="${MICROSLOP_BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${MICROSLOP_BACKEND_PORT:-8765}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
TEXT_EMBEDDING_MODEL="${TEXT_EMBEDDING_MODEL:-nomic-embed-text}"

BACKEND_PID=""
OLLAMA_PID=""

log() {
  printf '\n==> %s\n' "$1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

cleanup() {
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "$OLLAMA_PID" ] && kill -0 "$OLLAMA_PID" >/dev/null 2>&1; then
    kill "$OLLAMA_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  printf '%s did not become ready at %s\n' "$label" "$url" >&2
  return 1
}

install_tesseract() {
  if have tesseract; then
    log "Tesseract already installed"
    return
  fi

  log "Installing Tesseract"
  case "$(uname -s)" in
    Darwin)
      if ! have brew; then
        printf 'Homebrew is required to install Tesseract on macOS: https://brew.sh\n' >&2
        exit 1
      fi
      brew install tesseract
      ;;
    Linux)
      if have apt-get; then
        sudo apt-get update
        sudo apt-get install -y tesseract-ocr
      else
        printf 'Install Tesseract manually for this Linux distro, then rerun this script.\n' >&2
        exit 1
      fi
      ;;
    *)
      printf 'Unsupported OS for automatic Tesseract install. Install it manually, then rerun.\n' >&2
      exit 1
      ;;
  esac
}

install_ollama() {
  if have ollama; then
    log "Ollama already installed"
    return
  fi

  log "Installing Ollama"
  case "$(uname -s)" in
    Darwin)
      if ! have brew; then
        printf 'Homebrew is required to install Ollama on macOS: https://brew.sh\n' >&2
        exit 1
      fi
      brew install ollama
      ;;
    Linux)
      curl -fsSL https://ollama.com/install.sh | sh
      ;;
    *)
      printf 'Unsupported OS for automatic Ollama install. Install it manually, then rerun.\n' >&2
      exit 1
      ;;
  esac
}

python_bin() {
  for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if have "$candidate"; then
      command -v "$candidate"
      return
    fi
  done

  printf 'Python 3.10+ is required. Install Python, then rerun this script.\n' >&2
  exit 1
}

python_version_key() {
  "$1" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'
}

setup_backend() {
  local py_bin
  local py_version
  local venv_version

  py_bin="$(python_bin)"
  py_version="$(python_version_key "$py_bin")"
  log "Using Python $py_version at $py_bin"

  if "$py_bin" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
    :
  else
    printf 'Python 3.10+ is required, found %s.\n' "$py_version" >&2
    exit 1
  fi

  if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
    venv_version="$(python_version_key "$BACKEND_DIR/.venv/bin/python")"
  else
    venv_version=""
  fi

  if [ "$venv_version" != "$py_version" ]; then
    log "Creating backend virtualenv"
    "$py_bin" -m venv --clear "$BACKEND_DIR/.venv"
  fi

  log "Installing backend dependencies"
  "$BACKEND_DIR/.venv/bin/python" -m pip install --upgrade pip
  "$BACKEND_DIR/.venv/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"
}

setup_frontend() {
  if ! have npm; then
    printf 'npm is required. Install Node.js, then rerun this script.\n' >&2
    exit 1
  fi

  log "Installing frontend dependencies"
  npm --prefix "$ROOT_DIR" install
}

start_ollama() {
  if curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    log "Ollama already running"
    return
  fi

  log "Starting Ollama"
  ollama serve &
  OLLAMA_PID="$!"
  wait_for_url "$OLLAMA_URL/api/tags" "Ollama"
}

pull_models() {
  log "Pulling Ollama embedding model: $TEXT_EMBEDDING_MODEL"
  ollama pull "$TEXT_EMBEDDING_MODEL"

  log "Pulling Ollama chat model: $OLLAMA_MODEL"
  if ! ollama pull "$OLLAMA_MODEL"; then
    printf '\nCould not pull %s. Install a supported Ollama chat model and update Settings.\n' "$OLLAMA_MODEL" >&2
  fi
}

start_backend() {
  log "Starting FastAPI backend on $BACKEND_HOST:$BACKEND_PORT"
  (
    cd "$BACKEND_DIR"
    MICROSLOP_BACKEND_HOST="$BACKEND_HOST" \
      MICROSLOP_BACKEND_PORT="$BACKEND_PORT" \
      OLLAMA_URL="$OLLAMA_URL" \
      exec ./.venv/bin/uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload
  ) &
  BACKEND_PID="$!"
  wait_for_url "http://$BACKEND_HOST:$BACKEND_PORT/status" "FastAPI backend"
}

run_app() {
  log "Starting Electron app"
  MICROSLOP_BACKEND_URL="http://$BACKEND_HOST:$BACKEND_PORT" npm --prefix "$ROOT_DIR" run dev
}

install_tesseract
install_ollama
setup_backend
setup_frontend
start_ollama
pull_models
start_backend
run_app
