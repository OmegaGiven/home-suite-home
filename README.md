# Sweet

Sweet is a homelab-first collaboration suite scaffold with a Rust API and a TypeScript browser client.

## Included

- Axum-based API with auth, notes, diagrams, voice memo, room, message, and websocket routes
- Local-disk blob storage abstraction
- Browser app with sections for notes, diagrams, voice memos, chat, and calls
- Docker Compose stack for the API, web client, Postgres, coturn, and a self-hosted diagrams.net editor

## Run locally

```bash
cp .env.example .env
cargo run --manifest-path server/Cargo.toml
cd web && npm install && npm run dev
```

## Run with Docker Compose

```bash
docker compose up --build
```

The diagrams editor is served from the local `drawio` container at [http://localhost:18083](http://localhost:18083) and embedded into the Sweet Diagrams page in iframe embed mode.

## Current implementation status

This repository implements the initial vertical slice and contract scaffolding for the planned v1. The API and UI are wired together and runnable, but several advanced production concerns are still intentionally lightweight in this first pass:

- OIDC/AuthentiK endpoints are configured and surfaced, but the full browser redirect flow is not yet completed.
- Note collaboration uses websocket broadcast and client reconciliation rather than a full CRDT engine.
- Transcription jobs use `ffmpeg` plus `whisper.cpp` when the server is configured with `WHISPER_COMMAND`, `FFMPEG_COMMAND`, and a model file path.
- Calls use WebRTC signaling endpoints and TURN configuration, but media quality and multi-party behavior still need hardening.
