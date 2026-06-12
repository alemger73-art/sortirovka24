# Railway / Docker build for the FastAPI backend (app/backend).
# Build context is the repository root.
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

EXPOSE 8000

# Railway injects $PORT at runtime; default to 8000 locally.
# --proxy-headers ensures the real client IP is used (admin login lockout, logs).
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"]
