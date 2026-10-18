#!/usr/bin/env bash
# Build a release from git, start it, verify health; roll back automatically on failure.
# Usage: bash deploy.sh <git-ref>   (e.g. main or a commit sha)
set -euo pipefail
REF="${1:-main}"
cd /opt/s24
[ -d src ] || git clone https://github.com/alemger73-art/sortirovka24.git src
git -C src fetch --prune origin
git -C src checkout -q --detach "origin/${REF}" 2>/dev/null || git -C src checkout -q --detach "${REF}"
SHA=$(git -C src rev-parse --short HEAD)
PREV=$(docker image inspect s24-app:current --format '{{index .RepoTags 0}}' 2>/dev/null || true)
docker build -t "s24-app:${SHA}" src
[ -n "$PREV" ] && docker tag s24-app:current s24-app:previous || true
docker tag "s24-app:${SHA}" s24-app:current
cp src/deploy/hoster/docker-compose.yml src/deploy/hoster/Caddyfile /opt/s24/
docker compose up -d
for i in $(seq 1 40); do
  if docker compose exec -T app python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=5)" 2>/dev/null; then
    echo "OK: release ${SHA} is healthy"; echo "${SHA} $(date -Is)" >> /opt/s24/releases.log; exit 0
  fi
  sleep 5
done
echo "FAILED: ${SHA} not healthy, rolling back" >&2
if docker image inspect s24-app:previous >/dev/null 2>&1; then
  docker tag s24-app:previous s24-app:current
  docker compose up -d app
fi
exit 1
