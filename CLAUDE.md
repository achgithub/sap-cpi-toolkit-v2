# SAP CPI Toolkit V2 — Claude Project Configuration

## Overview

Clean rebuild of SAP CPI Toolkit. Journey-centric: Design → Develop → Test.
V1 remains active at `/Users/andrewharris/projects/sap--cpi-toolkit` as the working POC and reference.

See `docs/v2-architecture.md` (in V1 repo) for full architecture.

## Repository

https://github.com/achgithub/sap-cpi-toolkit-v2

## Go Module Path

`github.com/achgithub/sap-cpi-toolkit-v2`

## Services & Ports

| Service | Local Port | Notes |
|---|---|---|
| portal | 3000 | React UI + IAS auth + API proxy |
| api | 8080 | Core Go backend (Phase 2+) |
| groovy-runner | 8082 | JVM Groovy execution (Phase 2+) |
| sftp-adapter | 2222 | SFTP simulator (Phase 2+) |
| http-tools | 8090 | HTTP client + mock server (Phase 2+) |
| postgres | 5432 | All persistent state (Phase 2+) |

## Build Phase Status

| Phase | Status |
|---|---|
| Phase 1 — Portal shell + nav scaffold | In progress |
| Phase 2 — Full service scaffold (api, postgres, etc.) | Pending Phase 1 sign-off |
| Step 1 Foundation — Auth, project CRUD, data model | Pending |

## Build Commands

Go and npm are NOT needed on the host — all compilation runs inside Docker multi-stage builds.

```bash
# Build and start (Phase 1: portal only)
docker compose -f deployments/local/docker-compose.yml up --build

# Rebuild portal after changes
docker compose -f deployments/local/docker-compose.yml up --build portal

# View logs
docker compose -f deployments/local/docker-compose.yml logs -f

# Tear down
docker compose -f deployments/local/docker-compose.yml down
```

Open http://localhost:3000 after the stack is up.

## Key Architecture Decisions

- **Auth bypass**: Only active when `DEPLOYMENT_ENV=local` AND `AUTH_BYPASS_ENABLED=true`.
- **Portal proxies everything**: `/api/v2/*` → `api` service. `api` is never internet-exposed.
- **Single Go proxy path**: `/api/v2/` (V1 used `/api/worker/`, `/api/groovy/` etc. — V2 uses one upstream).
- **No Redis**: PostgreSQL handles all state.
- **Ephemeral keys/certs**: Never stored, download only.
- **Scaffold and copy restricted** to TRL / SBX / DEV system types only.
