#!/usr/bin/env sh
set -eu

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date +%Y%m%d-%H%M%S)"
output="$backup_dir/shao-platform-$stamp.sql.gz"

docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-shao}" \
  "${POSTGRES_DB:-shao_platform}" | gzip > "$output"

find "$backup_dir" -type f -name 'shao-platform-*.sql.gz' -mtime +14 -delete
echo "$output"
