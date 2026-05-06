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
| 020–025 | Old interface registry (superseded by 026) |
| 026 | Interface registry rebuild — company-wide, no project_id |
| 027 | Interface ref as TEXT (was CHAR(10)) |
| 028 | Drop integration_platform column |
| 029 | Via hops — JSONB on interfaces + receivers |
| 030 | Flow diagram state — JSONB on interfaces + logical_groups |

## Interface Registry (`interfaces` service)

Separate Go service with its own Dockerfile and lifecycle. **Company-wide** — no project scoping on systems or interfaces. Projects are a delivery lens only.

### Data model

**`systems`** — integration landscape nodes (company-wide)
- `name`, `system_type`, `infra_type`, `infra_region`, `owner_type`, `pos_x`, `pos_y`

**`logical_groups`** — optional grouping for flow diagrams
- `name`, `description`, `flow_diagram_state JSONB`

**`interfaces`** — the registry (company-wide)
- `name`, `ref` (10-char unique TEXT), `build_ref`, `status`, `interface_type`
- `sender_system_id`, `logical_group_id`, `sequence_in_group`
- `sender_step_label`, `receiver_step_label`, `functional_domain`
- `via JSONB` — ordered array of `{label, system_id?}` intermediate hops (shared across all receivers)
- `delivery_project_id`, `description`
- `flow_diagram_state JSONB` — freeform canvas state for flow diagram

**`interface_receivers`** — one row per receiver leg (supports broadcast/P2P)
- `system_id`, `transport`, `auth_type`, `credential_alias`
- `via JSONB` — per-leg intermediate hops before this specific receiver

**`registry_config`** — global key/JSONB config
- Keys: `system_types` (name + color), `infra_types` (name + category), `integration_platforms` (name)

### Interface types
- `point_to_point` — single sender, single receiver
- `broadcast` — single sender, multiple receivers
- `shared_library` — no system pair, package-level artifact
- `utility`

### API routes (all under `/api/interfaces/`)
- `GET/POST /systems`, `PUT/DELETE /systems/{id}`
- `GET/POST /logical-groups`, `PUT/DELETE /logical-groups/{id}`
- `GET/PUT /logical-groups/{id}/flow-diagram`
- `GET/POST /interfaces`, `GET/PUT/DELETE /interfaces/{id}`
- `POST/PUT/DELETE /interfaces/{id}/receivers/{rid}`
- `GET/POST /interfaces/{id}/dependencies`, `DELETE /interfaces/{id}/dependencies/{did}`
- `GET/PUT /interfaces/{id}/flow-diagram`
- `GET /diagram` — architecture diagram edges (aggregated, filtered)
- `GET/PUT /config/{key}`

## Design Phase — four views

### Architecture View (Design → Architecture)
Custom SVG+div canvas showing systems as nodes and interfaces as aggregated edges.
- Boxes drag freely, positions saved to DB
- Pan: drag background. Zoom: scroll wheel
- Fit button, Refs/Count toggle, edge colour picker (localStorage per pair)
- Click edge → popup with interface list; click ref → opens Registry filtered to that pair
- **Three filters** using strict pool logic (both endpoints must be in pool):
  - System filter: selected system IDs
  - Status filter: interfaces matching selected statuses
  - Infra filter: systems with matching `infra_type`
- Filter state is lifted to `DesignPhase` so it survives tab switches
- "Open in Registry" button navigates to Registry with sender/receiver pre-filtered; back button returns

### Flow Diagram (Design → Flow Diagram)
Freeform canvas diagram editor per interface or logical group.
- **Left panel**: logical groups (bold) with their interfaces indented + ref badge; ungrouped interfaces below. Collapsible with ‹/› toggle.
- **Initial layout**: auto-generated from interface data (sender → shared via hops → receivers). One-time seed only — subsequent opens restore saved state.
- **Canvas elements**: System boxes, Hop boxes (via hops), Step boxes (numbered steps), Text labels, Boundary lines (dashed vertical). All draggable.
- **Resize**: 8-handle resize on selected nodes.
- **Lines**: draw by selecting Line tool then drag from source node to target; draggable waypoints; arrow direction + label editable; `+ Bend` adds a midpoint.
- **Toolbar**: Select | System | Hop | Step | Text | Boundary | Line | [node color + font size] | [edge arrow + label + bend] | Reseed | Fit | Save
- **Reseed**: regenerates layout from interface data, discarding saved state (confirmation required)
- **Persistence**: `flow_diagram_state JSONB` saved per interface or logical group

### Registry Grid (Design → Registry)
Full CRUD table for interfaces. Reachable directly or via "Open in Registry" from Architecture view.
- MultiDropdown filters: status, interface type, sender/receiver system pair
- ViaEditor: tag-based editor for via hops on interface and per-receiver
- Inline group creation
- Back button when navigated from Architecture view

### System View (Design → Systems)
Table of all systems with interface touch counts (as sender + as receiver). Full CRUD.

## Toolbox → Registry Settings
Global config editor for system types (name + colour), infrastructure types (name + category), and integration platforms. Changes apply company-wide.

## Scaffold Templates

Per-fragment variants with project scoping. Global defaults seeded on startup (13 fragments).
- Global defaults: Toolbox → Adapter Templates
- Project overrides: Design → Templates tab

## TODO

- [ ] E2E tests
- [ ] Logical groups management UI (list/edit/delete outside of interface form inline creation)

## Key Architecture Decisions

- **Auth bypass**: Only active when `DEPLOYMENT_ENV=local` AND `AUTH_BYPASS_ENABLED=true`.
- **Portal proxies everything**: `api` and `interfaces` are never internet-exposed.
- **Interfaces service**: separate binary, own Dockerfile, shares postgres with api. Migrations still run in api (migration owner).
- **No Redis**: PostgreSQL handles all state.
- **Ephemeral keys/certs**: Never stored, download only.
- **Scaffold and copy restricted** to TRL / SBX / DEV system types only.
- **Company-wide registry**: no project_id on systems, interfaces, or logical groups. Projects only appear on `delivery_project_id` as a filter/label.
- **Via hops**: JSONB arrays on interfaces (shared path) and receivers (per-leg). Replace the old `integration_platform` field.
- **Flow diagram**: freeform SVG+div canvas, state persisted as JSONB. Auto-seeded once from interface data; all edits manual thereafter.
- **Architecture diagram**: custom SVG canvas. Positions stored in DB. Edge colours in localStorage.
- **Never run `docker compose down -v`** without explicit user confirmation — destroys all data.
