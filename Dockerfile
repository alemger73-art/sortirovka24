# SPA+API image when the Docker build context is the repository root.
# Railway Root Directory is a dashboard setting (cannot be changed from git).
# If a service uses Root Directory=app/backend, it builds app/backend/Dockerfile
# instead (API-only). Prefer empty Root Directory + this file for www / SPA+API.

# ---- Stage 1: build the frontend (pnpm + locked deps) ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend

ENV NODE_OPTIONS=--max-old-space-size=4096

RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

# Install dependencies first for better layer caching.
# .npmrc (node-linker=hoisted) must be present before install.
COPY app/frontend/package.json app/frontend/pnpm-lock.yaml app/frontend/.npmrc ./
RUN pnpm install --frozen-lockfile

# Build the production bundle into /app/frontend/dist.
COPY app/frontend/ ./
# Railway injects RAILWAY_GIT_COMMIT_SHA as a build arg when available.
ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV APP_BUILD_ID=${RAILWAY_GIT_COMMIT_SHA}
# vite build only — tsc is enforced in CI; keeps Railway deploys resilient
RUN pnpm exec vite build

# ---- Stage 2: backend runtime ----
FROM python:3.12-slim

ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_BUILD_ID=${RAILWAY_GIT_COMMIT_SHA}

WORKDIR /app/backend

# Install Python dependencies first (better layer caching).
COPY app/backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the backend source.
COPY app/backend/ ./

# Copy the built frontend next to the backend; main.py serves it as the SPA.
COPY --from=frontend /app/frontend/dist ./frontend_dist

EXPOSE 8000

# Run DB migrations, then start the API (same as app/backend/start.sh).
CMD ["sh", "-c", "alembic upgrade head || echo 'WARNING: alembic upgrade failed'; uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"]
