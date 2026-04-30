# SAP CPI Toolkit V2 — Claude Project Configuration

## Overview

Clean rebuild of SAP CPI Toolkit. Journey-centric: Design → Develop → Test.
V1 remains active at `/Users/andrewharris/projects/sap--cpi-toolkit` as the working POC and reference.

## Repository

https://github.com/achgithub/sap-cpi-toolkit-v2

## Go Module Path

`github.com/achgithub/sap-cpi-toolkit-v2`

## Services & Ports

| Service | Local Port | Notes |
|---|---|---|
| portal | 3000 | React UI + IAS auth + API proxy |
| api | 8080 | Core Go backend — CPI, scaffold, assets, monitoring, test packs |
| interfaces | 8083 | Interface registry service (own lifecycle) |
| groovy-runner | 8082 | JVM Groovy execution |
| sftp-server | 2222 | SFTP simulator |
| postgres | 5432 | All persistent state |

Portal proxies:
- `/api/v2/*` → `api:8080`
- `/api/interfaces/*` → `interfaces:8083`
- `/api/groovy/*` → `groovy-runner:8082`

## Build Commands

Go and npm are NOT needed on the host — all compilation runs inside Docker multi-stage builds.

```bash
# Build and start all services
docker compose -f deployments/local/docker-compose.yml up --build

# Rebuild a single service
docker compose -f deployments/local/docker-compose.yml up --build portal
docker compose -f deployments/local/docker-compose.yml up --build interfaces

# View logs
docker compose -f deployments/local/docker-compose.yml logs -f

# Tear down (never use -v without explicit confirmation)
docker compose -f deployments/local/docker-compose.yml down
```

Open http://localhost:3000 after the stack is up.

## Database Migrations

Migrations live in `internal/db/migrations/` and are applied by the `api` service on startup.
Current migrations:

| # | Description |
|---|---|
| 001 | Foundation — projects, instances, members |
| 002 | Token URL on instances |
| 003 | Monitoring tiles |
| 004 | Instance PI key |
| 005 | Assets |
| 006 | SFTP server |
| 007 | SFTP defaults |
| 008 | Lookup tables |
| 009 | Assets meta |
| 010 | Test packs |
| 011 | Test cases SFTP |
| 012 | Test cases wait |
| 013 | Scheduled jobs |
| 014 | Mock server |
| 015 | Mock config |
| 016 | Reset auto cert |
| 017 | Assets unique name |
| 018 | Scaffold templates |
| 019 | Scaffold template fragments (per-fragment variants + project scoping) |
| 020 | Interface registry — systems, interfaces, interface_receivers |
| 021 | Interface registry v2 — infra hosting, integration platform, edge style, registry_config |
| 022 | Interface ref — 10-char unique reference per interface |

## Interface Registry (`interfaces` service)

Separate Go service with its own Dockerfile and lifecycle. Manages the integration landscape for each project.

### Data model

**`systems`** — external system nodes per project
- `name`, `system_type`, `infra_type`, `infra_region`, `pos_x`, `pos_y`

**`interfaces`** — the registry
- Diagram-bound: `name`, `interface_type`, `status`, `sender_system_id`, `interface_ref` (10-char unique)
- Registry-bound: `integration_platform`, `cpi_package_id`, `cpi_iflow_id`, `transport`, `auth_type`, `credential_alias`
- Unbound: `meta JSONB`

**`interface_receivers`** — one row per receiver leg (supports broadcast/P2P)
- `system_id`, `cpi_iflow_id`, `transport`, `auth_type`, `credential_alias`, `meta JSONB`

**`registry_config`** — global key/JSONB config (system types+colors, infra types, integration platforms)

### Interface types
- `point_to_point` — single sender, single receiver
- `broadcast` — single sender, multiple receivers (per-leg config on receivers table)
- `shared_library` — package-level artifact, no system pair
- `utility`

### API routes (all under `/api/interfaces/`)
- `GET/POST /projects/{pid}/systems`
- `PUT/DELETE /projects/{pid}/systems/{id}`
- `GET/POST /projects/{pid}/interfaces`
- `GET/PUT/DELETE /projects/{pid}/interfaces/{id}`
- `POST/PUT/DELETE /projects/{pid}/interfaces/{id}/receivers/{rid}`
- `GET/PUT /config/{key}` — system_types, infra_types, integration_platforms

## Interface Diagram (Design → Interface Diagram tab)

Custom SVG+div canvas (no React Flow — replaced due to edge routing issues).

### Canvas behaviour
- Boxes drag freely, snap to 20px grid, positions saved to DB
- Lines connect nearest border points (shortest path, recalculated on move)
- Pan: drag background. Zoom: scroll wheel centred on cursor
- **⤢ Fit**: fits all visible nodes into viewport
- **⊞ Refs / # Count toggle**: switches between interface_ref labels and count badge on edges
- Edge colour: click a line → colour picker (8 colours, persisted to localStorage per project)
- Click line → popup lists interfaces; click ref label → opens that interface directly; click `+N` → overflow popup

### Filters (above canvas)
Three filters, all use **strict pool logic** — both endpoints of an interface must be within the selected pool:

| Filter | Pool | Behaviour |
|---|---|---|
| **System** | Selected system IDs | Shows only interfaces between selected systems; boxes = selected systems only |
| **Status** | Matching interfaces | Hides systems with no remaining interfaces |
| **Infra** | Systems with matching `infra_type` | Shows only interfaces where both endpoints are in the infra pool; non-pool systems hidden |

On filter change: Dagre re-lays out visible nodes compactly, then auto-fits.

### Toolbox → Registry Settings
Global config editor for system types (name + colour), infrastructure types (name + category), and integration platforms. Changes apply across all projects.

## Scaffold Templates

Per-fragment variants with project scoping. Global defaults seeded on startup (13 fragments).
- Global defaults: Toolbox → Adapter Templates
- Project overrides: Design → Templates tab

## TODO

- [ ] E2E tests
- [ ] Interface registry — table view (alongside the diagram, showing all interfaces in a sortable/filterable grid)

## Key Architecture Decisions

- **Auth bypass**: Only active when `DEPLOYMENT_ENV=local` AND `AUTH_BYPASS_ENABLED=true`.
- **Portal proxies everything**: `api` and `interfaces` are never internet-exposed.
- **Interfaces service**: separate binary, own Dockerfile, shares postgres with api. Migrations still run in api (migration owner).
- **No Redis**: PostgreSQL handles all state.
- **Ephemeral keys/certs**: Never stored, download only.
- **Scaffold and copy restricted** to TRL / SBX / DEV system types only.
- **Interface diagram**: custom SVG canvas (not React Flow). Positions stored in DB. Edge colours in localStorage.
- **Never run `docker compose down -v`** without explicit user confirmation — destroys all data.
