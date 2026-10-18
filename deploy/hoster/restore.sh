#!/usr/bin/env bash
# Restore an encrypted dump into the running db container. Needs the private age key.
# Usage: bash restore.sh /path/s24-YYYYmmdd-HHMM.dump.age /path/age-key.txt
set -euo pipefail
FILE="$1"; KEY="$2"
cd /opt/s24
set -a; . ./.env; set +a
docker compose stop app
age -d -i "$KEY" "$FILE" | docker compose exec -T db pg_restore -U "${POSTGRES_USER:-postgres}" \
  -d "${POSTGRES_DB:-railway}" --clean --if-exists --no-owner
docker compose start app
echo "restored $(basename "$FILE")"
