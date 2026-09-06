# Works when Railway Root Directory is app/backend (Docker context cannot see ../frontend).
# Frontend is fetched from GitHub at RAILWAY_GIT_COMMIT_SHA so the SPA matches this deploy.
# Prefer repo-root Dockerfile when Root Directory is empty — that path is simpler/faster.

# ---- Stage 1: build frontend from the monorepo commit being deployed ----
FROM node:20-slim AS frontend
WORKDIR /src

# Railway may pass an empty build-arg (overrides Docker default). Sanitize before fetch.
ARG RAILWAY_GIT_COMMIT_SHA=main
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && SHA="${RAILWAY_GIT_COMMIT_SHA}" \
 && case "$SHA" in ""|"unknown"|"null"|"undefined") SHA=main ;; esac \
 && echo "Fetching alemger73-art/sortirovka24@${SHA}" \
 && (curl -fsSL "https://codeload.github.com/alemger73-art/sortirovka24/tar.gz/${SHA}" -o /tmp/repo.tgz \
     || curl -fsSL "https://codeload.github.com/alemger73-art/sortirovka24/tar.gz/main" -o /tmp/repo.tgz) \
 && tar -xzf /tmp/repo.tgz -C /src --strip-components=1 \
 && rm /tmp/repo.tgz

WORKDIR /src/app/frontend
RUN corepack enable \
 && corepack prepare pnpm@8.10.0 --activate \
 && pnpm install --frozen-lockfile \
 && pnpm exec vite build

# ---- Stage 2: backend runtime + SPA ----
FROM python:3.12-slim

ARG RAILWAY_GIT_COMMIT_SHA=unknown
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_BUILD_ID=${RAILWAY_GIT_COMMIT_SHA}

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . ./
COPY --from=frontend /src/app/frontend/dist ./frontend_dist

EXPOSE 8000

CMD ["sh", "start.sh"]
