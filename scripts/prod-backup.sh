#!/usr/bin/env sh
set -eu

BASE_DIR="${ORKEN_BASE_DIR:-/home/deploy/orken-life}"
ENV_FILE="$BASE_DIR/shared/.env"
APP_DIR="$BASE_DIR/current"
BACKUP_DIR="$BASE_DIR/backups"
PROJECT="${COMPOSE_PROJECT_NAME:-orkenlife}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

POSTGRES_USER_VALUE="$(grep '^POSTGRES_USER=' "$ENV_FILE" | sed 's/^POSTGRES_USER=//' || true)"
POSTGRES_DB_VALUE="$(grep '^POSTGRES_DB=' "$ENV_FILE" | sed 's/^POSTGRES_DB=//' || true)"
POSTGRES_USER_VALUE="${POSTGRES_USER_VALUE:-orken}"
POSTGRES_DB_VALUE="${POSTGRES_DB_VALUE:-orken_life}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

DB_OUT="$BACKUP_DIR/postgres-$STAMP.sql.gz"
UPLOADS_OUT="$BACKUP_DIR/uploads-$STAMP.tar.gz"

docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml -p "$PROJECT" \
  exec -T postgres pg_dump -U "$POSTGRES_USER_VALUE" "$POSTGRES_DB_VALUE" | gzip -9 > "$DB_OUT"

if docker volume inspect "${PROJECT}_orken_uploads" >/dev/null 2>&1; then
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "${PROJECT}_orken_uploads:/uploads:ro" \
    -v "$BACKUP_DIR:/backup" \
    alpine:3.20 \
    tar -czf "/backup/$(basename "$UPLOADS_OUT")" -C /uploads .
fi

find "$BACKUP_DIR" -type f \( -name 'postgres-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

printf 'backup_ok stamp=%s db=%s uploads=%s\n' "$STAMP" "$DB_OUT" "$UPLOADS_OUT"
