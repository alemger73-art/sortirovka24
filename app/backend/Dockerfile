# API-only image when the Docker build context is app/backend
# (Railway Root Directory = app/backend). Serves FastAPI via start.sh.
#
# Root Directory is a Railway dashboard setting and cannot be changed from git.
# This Dockerfile intentionally does not build the SPA (frontend is outside the
# build context). For SPA+API on one URL, point the service at the repository
# root Dockerfile when Root Directory is empty / "/".

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . ./

EXPOSE 8000

CMD ["sh", "start.sh"]
