#!/usr/bin/env bash
# Serve site/ as plain static files on http://localhost:8077 (APP agent).
#   tools/serve.sh            foreground
#   tools/serve.sh &          background (or run_in_background); stop with: pkill -f "http.server 8077"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8077}"
cd "$ROOT/site"
echo "serving $ROOT/site on http://localhost:$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
