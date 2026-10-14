#!/usr/bin/env bash
# Screenshots of the prototype (APP agent): headless Chrome driven over the DevTools protocol,
# desktop 1280x720 and phone 390x844 (device-metrics emulation, so no minimum window width).
# Needs the local server (tools/serve.sh). Output: docs/proto/shots/*.png
#   tools/shots.sh                 all shots (list in tools/shots.mjs)
#   tools/shots.sh home wide-060   only these
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if ! curl -s -o /dev/null "${BASE:-http://localhost:8077}/"; then
  echo "server not running: start tools/serve.sh first" >&2
  exit 2
fi
exec node "$ROOT/tools/shots.mjs" "$@"
