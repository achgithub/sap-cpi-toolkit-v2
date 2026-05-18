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

## Deployment Target

Production target is **Kyma (Kubernetes on SAP BTP)**. Docker Compose is for local development only.
- Network isolation in production is handled by Kubernetes Services (ClusterIP) and NetworkPolicies — not docker-compose port bindings
- Secrets in production must use Kubernetes Secrets, not `.env` files or hardcoded constants
- `DEPLOYMENT_ENV=local` and `AUTH_BYPASS_ENABLED=true` must never be set in Kyma — the auth bypass is dev-only by design
- The SSRF risk (C-2) is **elevated** in Kubernetes: the cluster network includes the K8s API server, cloud metadata endpoint (`169.254.169.254`), and other workloads

## Security Backlog

Issues identified by audit (2026-05-18). When touching related code, fix or avoid reintroducing these patterns.

### Critical
- [ ] **C-1 Groovy sandboxing** — `groovy-runner/ScriptExecutor.groovy` — apply `SecureASTCustomizer` to block `Runtime`, `ProcessBuilder`, `File`, and network classes; in Kyma run the pod with no egress NetworkPolicy and no volume mounts
- [ ] **C-2 SSRF in HTTP proxy** — `internal/api/httpclient.go` — block RFC-1918 ranges (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8) and the K8s metadata endpoint before forwarding; allowlist CPI tenant domains only

### High
- [ ] **H-2 OData filter injection** — `internal/api/monitoring.go` — allowlist `status` values; sanitise `iFlowID`, `packageID`, `idSearch` (alphanumeric + hyphens only) before interpolating into `$filter`
- [ ] **H-3 TLS private key in DB** — `internal/api/mock.go` — block `mode=custom` uploads in non-local environments; in Kyma use a Kubernetes Secret or cert-manager instead
- [ ] **H-4 Credential endpoint no RBAC** — `internal/api/instances.go:322` — gate `GET basic-auth` and SFTP config behind project membership role check

### Medium
- [ ] **M-1 No request body size limit** — `internal/api/handler.go` `decode()` — wrap body in `http.MaxBytesReader(w, r.Body, 4<<20)` before decoding
- [ ] **M-2 Hardcoded dev encryption key** — `cmd/api/main.go` — in Kyma, `ENC_KEY` must be set from a Kubernetes Secret; add a startup guard that refuses to start in non-local environments if `ENC_KEY` is unset or is the zero key
- [ ] **M-5 SSRF in scheduled jobs** — `internal/api/scheduler.go` — apply same URL restrictions as C-2 to HTTP job execution

### Local Dev Only (not applicable to Kyma)
- ~~M-6 Postgres port on 0.0.0.0~~ — irrelevant; Kyma uses ClusterIP Services
- ~~M-7 Mock server port on 0.0.0.0~~ — irrelevant; Kyma uses ClusterIP Services
- ~~H-1 Auth bypass default true~~ — docker-compose local dev only; `DEPLOYMENT_ENV` will not be `local` in Kyma

### Go Code Quality Backlog (audit 2026-05-18)
- [ ] **Scheduler context leak** — `cmd/api/main.go` / `scheduler.go` — pass cancellable context from main; cancel before `srv.Shutdown`
- [ ] **Context use-after-cancel in mock goroutines** — `internal/api/mock.go:148` — use `context.WithoutCancel(r.Context())` for fire-and-forget DB writes
- [ ] **Non-transactional migrations** — `internal/db/migrate.go` — wrap each migration + schema_migrations insert in a transaction
- [ ] **TOCTOU in deleteVariant** — `scaffold_template_store.go:372` — wrap check + delete in a transaction
- [ ] **matchPath wildcard bug** — `internal/api/mock.go:48` — fix prefix match: `path == prefix || strings.HasPrefix(path, prefix+"/")`
- [ ] **sftpDeleteEntry can delete root** — `internal/api/sftpfiles.go:165` — reject deletion when `abs == root`
- [ ] **DB error masked as 404** — multiple handlers — check `err != nil` → 500 separately from `RowsAffected() == 0` → 404
- [ ] **JWKS fetch holds write lock** — `internal/auth/oidc.go:185` — fetch outside lock, re-acquire to update `p.keys`
- [ ] **crypto/rand for ref generation** — `internal/ifregistry/interfaces.go:91` — replace `math/rand.Intn` with `crypto/rand`

## Security Standards — Apply When Writing New Code

These rules prevent reintroduction of audited issues. Check them whenever touching the relevant areas:

1. **HTTP proxy / outbound requests** — always validate destination URL against RFC-1918 blocklist (and `169.254.169.254` for K8s metadata) before making outbound calls. Never forward to arbitrary user-supplied URLs without an allowlist.
2. **OData / external query strings** — never interpolate query parameters directly into filter strings. Allowlist enum values; escape or reject free-text inputs.
3. **Request body decoding** — always use `http.MaxBytesReader(w, r.Body, N)` before `json.NewDecoder`. 4 MB is the default cap unless the endpoint specifically handles larger payloads.
4. **Error responses** — never return `err.Error()` directly to the client. Log the full error; return a generic message to the caller.
5. **DB error handling** — always check `err != nil` (→ 500) separately from `RowsAffected() == 0` (→ 404). Never conflate them.
6. **Goroutines** — fire-and-forget goroutines that do DB writes must use `context.WithoutCancel(r.Context())`, not `r.Context()` directly.
7. **Random identifiers** — use `crypto/rand` for all generated IDs, refs, and tokens. Never use `math/rand`.
8. **Config key validation** — any endpoint that writes to `registry_config` must validate the key against a known allowlist.
9. **Scheduler HTTP jobs** — apply same SSRF mitigations as the HTTP proxy to any scheduler-executed HTTP request.
10. **Secrets in Kyma** — `ENC_KEY` and any credentials must come from Kubernetes Secrets mounted as env vars. Never hardcode or default to zero/dev values in non-local deployments. Add a startup guard.

## Registry V2 Diagram Rules (locked in 2026-05-18)

- **Flow diagram**: business systems ALWAYS left and right. Integration components ALWAYS in the middle. Even for scheduled/event triggers (where the component initiates), the source system appears on the LEFT with a bidirectional "trigger / fetch" edge to the component. API callouts float ABOVE their component hop as separate boxes — the main horizontal flow line stays clean.
- **Architecture diagram (V2)**: skip all integration components. Draw business system → business system edges only, with interface counts. Use `trigger_system_id` or `source_system_id` as the left node; `receiver.system_id` as the right node. No via hops appear here.

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
