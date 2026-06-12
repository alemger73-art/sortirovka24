#!/bin/sh
# Production start script. Binds to the platform-provided $PORT (Railway, etc.),
# defaulting to 8000 for local use. Using a script guarantees correct shell
# variable expansion regardless of how the platform invokes the start command.
exec uvicorn main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips='*'
