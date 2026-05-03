#!/usr/bin/env bash
# Start LangGraph Agent Server and the Vite frontend together (development).
# Prerequisites: uv, Node/npm, Redis (see README). Copy .env.example → .env first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LG_PID=""
FE_PID=""

cleanup() {
  trap - INT TERM HUP EXIT 2>/dev/null || true
  if [[ -n "${LG_PID}" ]] && kill -0 "${LG_PID}" 2>/dev/null; then
    kill "${LG_PID}" 2>/dev/null || true
    wait "${LG_PID}" 2>/dev/null || true
  fi
  if [[ -n "${FE_PID}" ]] && kill -0 "${FE_PID}" 2>/dev/null; then
    kill "${FE_PID}" 2>/dev/null || true
    wait "${FE_PID}" 2>/dev/null || true
  fi
}

trap cleanup INT TERM HUP EXIT

if ! command -v uv >/dev/null 2>&1; then
  echo "error: uv is not installed (https://docs.astral.sh/uv/)" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is not installed" >&2
  exit 1
fi

if [[ ! -f "${ROOT}/.env" ]]; then
  echo "warning: ${ROOT}/.env not found — copy .env.example to .env and set your API keys." >&2
fi

if [[ ! -d "${ROOT}/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies (npm install)…"
  (cd "${ROOT}/frontend" && npm install)
fi

echo ""
echo "Starting LangGraph dev server (backend) and Vite (frontend)."
echo "  • Agent API:    http://localhost:2024 (default; Vite proxies /langgraph → here)"
echo "  • Web UI:       http://localhost:5173"
echo "Press Ctrl+C to stop both."
echo ""

uv run langgraph dev --n-jobs-per-worker 20 &
LG_PID=$!

(cd "${ROOT}/frontend" && npm run dev) &
FE_PID=$!

set +e
wait
WAIT_STATUS=$?
set -e

exit "${WAIT_STATUS}"
