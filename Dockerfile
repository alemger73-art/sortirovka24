# Railway / Docker build: builds the React frontend and serves it together with
# the FastAPI backend from a single image (one URL for the whole site).
# Build context is the repository root.

# ---- Stage 1: build the frontend ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend

# Install dependencies first for better layer caching.
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Build the production bundle into /app/frontend/dist.
COPY app/frontend/ ./
ARG APP_BUILD_ID=unknown
ENV APP_BUILD_ID=${APP_BUILD_ID}
RUN npm run build

# ---- Stage 2: backend runtime ----
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

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
