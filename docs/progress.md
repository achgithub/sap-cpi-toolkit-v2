# SAP CPI Toolkit V2 — Progress & Next Steps

_Last updated: 2026-04-27_

---

## What's Built

### Foundation
- Go 1.25 module (`github.com/achgithub/sap-cpi-toolkit-v2`)
- PostgreSQL with embedded migrations (pgx/v5)
- IAS OIDC auth with local bypass (`DEPLOYMENT_ENV=local` + `AUTH_BYPASS_ENABLED=true`)
- AES-GCM encryption for instance secrets
- SAP client with per-instance token bucket rate limiting (monitoring 30/min, operations 10/min, read 60/min)
- Full CRUD API: projects, sub-projects, instances (API key + PI key), project members

### Services (docker-compose)
| Service | Port | Status |
|---|---|---|
| portal (Go) | 3000 | ✅ Running |
| api (Go) | 8080 (internal) | ✅ Running |
| groovy-runner (JVM) | 8082 (internal) | ✅ Running |
| postgres | 5432 | ✅ Running |

### UI — Phase Tabs
| Phase | Nav Items | Status |
|---|---|---|
| Design | Project Setup, Interface Diagram | ✅ Project Setup fully working |
| Develop | XSLT Map Editor, Groovy IDE, iFlow Scaffold, Tech Spec | ✅ Groovy IDE live |
| Test | (placeholders) | 🔲 Placeholder |
| Monitoring | Dashboard, Message List | ✅ Fully working |

### Toolbox Tools
| Tool | Status | Notes |
|---|---|---|
| Formatter | ✅ | Client-side XML & JSON, no API needed |
| Groovy IDE + Runner | ✅ | Monaco editor, server-side lint, run, Script Library tab (18 scripts) |
| Security | ✅ | Auth Header (Basic, instance prefill), PGP, SSH, X.509 cert |
| HTTP Client | 🔲 Next | Proxy handler needed in API |
| SFTP Server | 🔲 Planned | Go SFTP adapter (V1 source ready to copy) |
| HTTP Mock Server | 🔲 Planned | Built into API behind `/mock/public/{token}/...` |
| EDI Tools | 🔲 Step 3 | EDIFACT & ANSI X12 |

---

## Immediate Next Steps (Resume Here)

### 1. HTTP Client tool
**Frontend:** `web/src/tools/HttpClient.tsx`
- Method selector + URL bar + Send button
- Key-value headers grid (auto-adds empty row)
- Body textarea
- Response panel: status code (coloured), headers, body (JSON pretty-print)
- URL validation warnings (whitespace, double-slash)

**Backend:** `internal/api/httpclient.go`
- `POST /api/v2/http-client/proxy`
- Takes `{ method, url, headers, body }`, makes outbound request server-side (avoids CORS)
- Returns `{ status, statusText, headers, body, durationMs }`
- 30s timeout, follows redirects preserving Authorization header
- No DB, stateless

**Wiring:**
- Register route in `handler.go`
- Mark `http-client` as `available: true` in `ToolboxPanel.tsx`
- Add Dialog in `App.tsx` (same maximize/close pattern)

### 2. SFTP Adapter service
- Copy `adapters/sftp/` from V1 (`/Users/andrewharris/projects/sap--cpi-toolkit/adapters/sftp/`)
- Add `sftp-adapter` service to `docker-compose.yml` (default profile, port 2222 on host)
- Add `cloudconnector` service to `docker-compose.yml` under `--profile scc`
  - References pre-built image `sap-cloudconnector:2.19.0`
  - User builds once from `/Users/andrewharris/projects/cloudconnector`
- Add Toolbox UI for SFTP (browse files, upload, download, manage users/keys)

### 3. HTTP Mock Server
**Architecture decision (agreed):** Built into the API service — no separate image.
- Mock configs stored in postgres (method, path pattern, response status/headers/body, latency)
- Public endpoint: `/mock/public/{token}/{...path}` — portal proxies this route **without auth**
- Authenticated management endpoints: `POST/GET/DELETE /api/v2/mock/configs`
- Logs incoming requests for inspection in the UI
- Goes in the **Test** phase tab

### 4. Scheduler
- In-memory goroutines in the API service — do not need to survive restarts
- Job configs persisted in postgres (respawn from DB on API restart)
- Scheduled job types: trigger HTTP request to iFlow endpoint, run a test pack
- UI in the **Test** phase tab alongside Mock Server

---

## Build Order (Remaining)

### Step 2 — Migrate V1 (in progress)
- [x] Formatter
- [x] Groovy IDE + Script Library
- [x] Security (Auth Header + Key/Cert Gen)
- [ ] HTTP Client
- [ ] SFTP Adapter + Cloud Connector wiring
- [ ] iFlow Scaffold (Develop tab)

### Step 3 — New Core
- XSD library (per project)
- XSLT Map Editor (Develop tab — XSD-aware)
- Test data generator

### Step 4 — Test Infrastructure
- HTTP Mock Server
- Scheduler
- Test packs (define, run, save results)

### Step 5 — POC Items
- Interface diagram (Design tab — POC already done, full build pending)
- Tech Spec generation (export to Word/PDF)
- Volume runner / load testing

---

## Architecture Reference

### Image Map
```
portal      — React UI + IAS auth + API proxy (port 3000)
api         — Go API, DB, SAP client, stateless tool handlers (internal :8080)
groovy-runner — JVM Groovy execution (internal :8082)
sftp-adapter  — Go SFTP server, toolkit-managed (internal :22, host :2222)
http-tools    — HTTP Mock Server (TBD — may fold into API)
postgres      — State (port 5432)
[sap-cloudconnector] — optional --profile scc, pre-built separately
```

### Key Decisions
- **Mock server path:** `/mock/public/{token}/...` — portal proxies without auth so CPI can call it
- **Cloud Connector:** separate standalone project, pre-built image referenced in V2 compose under `--profile scc`
- **Scheduler:** in-memory goroutines, config persisted in postgres
- **Script library:** static data file (18 curated scripts), not DB-backed. Per-project "My Scripts" is Step 3.
- **Asset store:** not yet implemented in V2. HTTP Client will not have Load/Save asset buttons initially.

### SFTP Test Flow (when Cloud Connector profile active)
```
SAP CPI (cloud) ──HTTPS──▶ sap-cloudconnector (:8443 admin) ──TCP:22──▶ sftp-adapter (:22)
```
1. `docker build -t sap-cloudconnector:2.19.0 .` (once, in cloudconnector project)
2. `docker compose --profile scc -f deployments/local/docker-compose.yml up --build`
3. Register SCC at https://localhost:8443 against BTP subaccount
4. Configure SCC virtual backend → `sftp-adapter:22`

---

## Repository
https://github.com/achgithub/sap-cpi-toolkit-v2
