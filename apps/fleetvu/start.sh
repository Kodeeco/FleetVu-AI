#!/bin/sh
# One command for a server you control. Port 4173 unless PORT is set.
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "FleetVu needs Node.js 20 or newer on this server." >&2
  exit 1
fi

if [ ! -d node_modules/express ]; then
  npm install --omit=dev
fi

PORT="${PORT:-4173}"
export PORT
echo "Starting FleetVu on port ${PORT}"
exec node server.js
