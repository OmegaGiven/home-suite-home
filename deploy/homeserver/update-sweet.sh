#!/usr/bin/env sh
set -eu

STACK_DIR="${SWEET_STACK_DIR:-/opt/sweet-deploy}"
COMPOSE_FILE="${SWEET_COMPOSE_FILE:-$STACK_DIR/docker-compose.yml}"

cd "$STACK_DIR"

docker-compose -f "$COMPOSE_FILE" pull server web
docker-compose -f "$COMPOSE_FILE" up -d server web
