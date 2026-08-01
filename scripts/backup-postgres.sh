#!/usr/bin/env sh
set -eu
umask 077

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date +%Y%m%d-%H%M%S)"
output="$backup_dir/shao-platform-$stamp.sql.gz"

if command -v docker >/dev/null 2>&1 \
  && docker compose ps --services --status running 2>/dev/null | grep -qx postgres; then
  docker compose exec -T postgres pg_dump \
    -U "${POSTGRES_USER:-shao}" \
    "${POSTGRES_DB:-shao_platform}" | gzip > "$output"
elif [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" | gzip > "$output"
else
  echo "找不到可用的 PostgreSQL 备份方式；请配置 DATABASE_URL 或启动 Compose postgres。" >&2
  rm -f "$output"
  exit 1
fi

if [ ! -s "$output" ]; then
  echo "备份文件为空，已终止。" >&2
  rm -f "$output"
  exit 1
fi

# 备份目录也可能保存由 root 创建的配置归档。这里只清理本脚本在
# 目录顶层生成的数据库备份，既避免越权遍历，也不会误删其他归档。
find "$backup_dir" -maxdepth 1 -type f -name 'shao-platform-*.sql.gz' -mtime +14 -delete
echo "$output"
