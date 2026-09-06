# INTENTIONAL FAIL when Railway Root Directory is app/backend.
# Docker build context cannot reach ../frontend, so this path can never ship the SPA.
#
# Fix (required for www / SPA+API):
#   Railway → Service → Settings → Root Directory = empty (repository root)
#   Use the root Dockerfile + root railway.json (dockerfilePath: "Dockerfile").
#   Config path for that service should be /railway.json (absolute from repo root).
#
# Do not set Root Directory to app/backend for the public site.

FROM python:3.12-slim
RUN printf '%s\n' \
  'ERROR: app/backend/Dockerfile cannot build frontend+API.' \
  'Build context is app/backend only — COPY cannot reach app/frontend.' \
  'Set Railway Root Directory to repository root (empty) and use /Dockerfile.' \
  >&2 && exit 1
