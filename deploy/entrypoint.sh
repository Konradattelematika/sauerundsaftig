#!/bin/sh
# Startet als root, macht /data für den node-Benutzer beschreibbar (Coolify-Volume gehört
# anfangs root) und startet den Server dann ohne Root-Rechte. exec → Node ist PID 1 und
# bekommt SIGTERM direkt (sauberer Shutdown).
set -eu
DATA_DIR="${SUS_DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec su-exec node node /app/server/index.mjs "$@"
fi
exec node /app/server/index.mjs "$@"
