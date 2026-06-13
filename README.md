# Helfy SRE Developer Project

A containerized web application demonstrating a full SRE observability pipeline: user authentication → structured logging → change data capture → Kafka event streaming.

## Architecture

```
Browser → Nginx (port 8080) → Express API → TiDB (pd + tikv)
                                                 ↓
                                           TiCDC (CDC)
                                                 ↓
                                           Kafka topic: db-mutations
                                                 ↓
                                        cdc-consumer (log4js)
```

| Service | Image | Role |
|---|---|---|
| `frontend` | nginx:alpine | Serves the login UI and reverse-proxies `/api/` to the backend |
| `api` | node:18-alpine | Express REST API — login, token issuance, token validation |
| `tidb` | pingcap/tidb:v8.1.0 | MySQL-compatible distributed SQL database |
| `tikv` | pingcap/tikv:v8.1.0 | TiDB's distributed key-value storage engine |
| `pd` | pingcap/pd:v8.1.0 | TiDB's placement driver (cluster coordinator) |
| `ticdc` | pingcap/ticdc:v8.1.0 | Captures row-level DB changes and streams them to Kafka |
| `kafka` | apache/kafka:4.3.0 | Message broker receiving the CDC stream |
| `cdc-consumer` | node:18-alpine | Consumes the `db-mutations` Kafka topic and logs mutations |

## Prerequisites

- Docker + Docker Compose

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/NachmanM/Helfy-SRE-Developer-Project.git
cd Helfy-SRE-Developer-Project

# 2. Create the API environment file
cp backend/api/.env.example backend/api/.env

# 3. Build and start all services
docker compose up --build
```

Open **http://localhost:8080** in your browser.

Default credentials: `root` / `password123`

## How It Works

1. The login form POSTs credentials to `/api/login` through Nginx.
2. The API hashes the password (SHA-256), checks it against TiDB, and returns a session token.
3. The frontend immediately calls `/api/verify-token` to confirm the token is valid in the database.
4. TiCDC watches TiDB for row-level changes and streams them as Canal-JSON events to the `db-mutations` Kafka topic.
5. The `cdc-consumer` subscribes to that topic and logs each mutation as structured JSON.

## Startup Timing

TiDB takes 30–60 seconds to become ready on a fresh machine (pd and tikv must initialize first). The API retries the database connection automatically — no manual intervention needed.

The CDC consumer also retries subscribing to the `db-mutations` topic until TiCDC has created the changefeed and Kafka has auto-created the topic (~30 seconds after TiCDC starts).

## Project Structure

```
├── backend/
│   ├── api/
│   │   ├── api.js            # Express app — login and token routes
│   │   ├── db-setup.js       # Schema bootstrap with retry logic
│   │   ├── schema.sql        # Creates DB, tables, and seed user
│   │   ├── Dockerfile
│   │   ├── .env              # Runtime config (git-ignored)
│   │   └── .env.example      # Template for .env
│   └── kafka-consumers/
│       ├── cdc-consumer.js   # Kafka consumer — logs DB mutations
│       └── Dockerfile
├── frontend/
│   ├── index.html            # Login UI
│   ├── nginx.conf            # Reverse proxy config
│   └── Dockerfile
├── docker-compose.yaml
└── package.json
```

## Ports

| Port | Service |
|---|---|
| `8080` | Frontend (Nginx) — main entry point |
| `4000` | TiDB MySQL port (host-exposed for direct access) |
| `2379` | PD client port |
| `8300` | TiCDC HTTP API |
| `9092` | Kafka broker |

## Logs

```bash
# API structured logs (login events with client IP)
docker logs api

# CDC mutation stream
docker logs cdc-consumer

# TiCDC changefeed status
docker logs ticdc
```
