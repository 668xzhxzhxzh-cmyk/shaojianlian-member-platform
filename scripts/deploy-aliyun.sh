#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "缺少 .env：请先复制 .env.example 并填写生产配置。"
  exit 1
fi

docker compose pull postgres gateway
docker compose build --pull
docker compose up -d
docker compose ps
