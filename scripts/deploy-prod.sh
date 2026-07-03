#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/deploy/orken-life}"
REPO_URL="${REPO_URL:-https://github.com/Vitamin-ZinC/my_fullstack_app.git}"
DEPLOY_REF="${DEPLOY_REF:-main}"
PROJECT_NAME="${PROJECT_NAME:-orkenlife}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICES="${SERVICES:-backend worker frontend}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
KEEP_RELEASES="${KEEP_RELEASES:-12}"
PRUNE_DOCKER="${PRUNE_DOCKER:-true}"

RELEASES_DIR="$APP_DIR/releases"
SHARED_DIR="$APP_DIR/shared"
CURRENT_LINK="$APP_DIR/current"
STAMP="$(date -u +%Y%m%d%H%M%S)"
TMP_DIR="$(mktemp -d)"

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

cleanup_tmp() {
  rm -rf "$TMP_DIR"
}
trap cleanup_tmp EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  }
}

safe_remove_release() {
  local target="$1"
  local releases_real target_real current_real
  releases_real="$(realpath "$RELEASES_DIR")"
  target_real="$(realpath "$target")"
  current_real="$(realpath "$CURRENT_LINK" 2>/dev/null || true)"

  if [[ "$target_real" != "$releases_real"/* ]]; then
    printf 'Refusing to remove path outside releases: %s\n' "$target_real" >&2
    exit 1
  fi
  if [[ -n "$current_real" && "$target_real" == "$current_real" ]]; then
    log "Keeping current release $target_real"
    return
  fi
  rm -rf "$target_real"
}

cleanup_old_releases() {
  [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || return
  (( KEEP_RELEASES > 0 )) || return

  mapfile -t releases < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort -r)
  local index=0
  for release in "${releases[@]}"; do
    index=$((index + 1))
    if (( index > KEEP_RELEASES )); then
      log "Removing old release $release"
      safe_remove_release "$release"
    fi
  done
}

require_command git
require_command docker
require_command realpath

mkdir -p "$RELEASES_DIR" "$SHARED_DIR"

if [[ ! -f "$SHARED_DIR/.env" ]]; then
  printf 'Missing shared env file: %s\n' "$SHARED_DIR/.env" >&2
  exit 1
fi

log "Fetching $DEPLOY_REF from $REPO_URL"
git -C "$TMP_DIR" init -q
git -C "$TMP_DIR" remote add origin "$REPO_URL"
git -C "$TMP_DIR" fetch --depth 1 origin "$DEPLOY_REF"
git -C "$TMP_DIR" checkout -q FETCH_HEAD

SHA="$(git -C "$TMP_DIR" rev-parse --short HEAD)"
RELEASE_DIR="$RELEASES_DIR/${STAMP}-${SHA}"

log "Creating release $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -C "$TMP_DIR" --exclude .git -cf - . | tar -C "$RELEASE_DIR" -xf -
ln -sfn "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
printf '%s\n' "$SHA" > "$RELEASE_DIR/REVISION"
cat > "$RELEASE_DIR/DEPLOY_INFO" <<INFO
sha=$SHA
ref=$DEPLOY_REF
repo=$REPO_URL
deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
services=$SERVICES
INFO

cd "$RELEASE_DIR"

log "Building services: $SERVICES"
docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build $SERVICES

if [[ "$RUN_MIGRATIONS" == "true" ]]; then
  log "Running Prisma migrations"
  docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" run --rm --no-deps \
    backend npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
fi

log "Switching current symlink to $RELEASE_DIR"
ln -sfnT "$RELEASE_DIR" "$CURRENT_LINK"

cd "$CURRENT_LINK"

log "Recreating services: $SERVICES"
docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d --force-recreate $SERVICES

log "Waiting for containers"
sleep "${POST_DEPLOY_SLEEP_SECONDS:-15}"

docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps

if docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps backend >/dev/null 2>&1; then
  log "Backend health"
  docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T backend \
    node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
fi

if docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps redis >/dev/null 2>&1; then
  log "Queue status"
  printf 'active='
  docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T redis redis-cli LLEN bull:analysis:active
  printf 'wait='
  docker compose --env-file .env -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T redis redis-cli LLEN bull:analysis:wait
fi

cleanup_old_releases

if [[ "$PRUNE_DOCKER" == "true" ]]; then
  log "Pruning Docker builder cache and unused images"
  docker builder prune -af
  docker image prune -af
fi

log "Disk usage"
df -h "$APP_DIR" /

log "Deploy complete: $SHA"
