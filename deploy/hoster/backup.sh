#!/usr/bin/env bash
# Encrypted PostgreSQL dump -> local copy + second server (Kazakhstan). Run from cron.
set -euo pipefail
cd /opt/s24
set -a; . ./.env; set +a
STAMP=$(date +%Y%m%d-%H%M)
OUT="/opt/s24/backups/s24-${STAMP}.dump.age"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-railway}" -Fc \
  | age -R /opt/s24/backup-recipients.txt > "$OUT"
[ "$(stat -c%s "$OUT")" -gt 10000 ] || { echo "backup too small" >&2; exit 1; }
rsync -e "ssh -i /root/.ssh/s24_backup -o StrictHostKeyChecking=accept-new" "$OUT" \
  "${BACKUP_USER}@${BACKUP_HOST}:/srv/s24-backups/"
find /opt/s24/backups -name 's24-*.dump.age' -mtime +7 -delete
ssh -i /root/.ssh/s24_backup "${BACKUP_USER}@${BACKUP_HOST}" \
  "find /srv/s24-backups -name 's24-*.dump.age' -mtime +${BACKUP_KEEP_DAYS:-30} -delete"
echo "$(date -Is) ok $(basename "$OUT")" >> /opt/s24/backups/backup.log
