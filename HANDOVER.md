# Session Handover — SAP CPI Toolkit V2

Date: 2026-05-01

---

## What was built this session

### 1. SQL-based diagram filter

Replaced all client-side JS filter logic with a single Postgres CTE endpoint.

**New file:** `internal/ifregistry/diagram.go`
- Route: `GET /projects/{pid}/diagram?systems=id1,id2&infra_types=AWS,Azure&statuses=active`
- Returns `{ systems: [...], interfaces: [...] }`
- Pool logic: `pool = selected system IDs ∪ systems with matching infra_type`
- Anchor logic: when system filter active, at least one endpoint must be an explicitly selected system (prevents pure infra↔infra edges appearing when a specific system is also selected)
- Visible systems: in pool AND participate in a filtered interface

**Updated:** `internal/ifregistry/handler.go` — registered new route

**Updated:** `web/src/pages/design/diagram/useRegistryData.ts`
- Added `loadDiagram(filter: DiagramFilter)` function
- Calls the diagram endpoint, returns `{ systems, interfaces }`

**Updated:** `web/src/pages/design/diagram/DiagramView.tsx`
- Removed entire `useMemo` filter block
- Added `diagramSystems` / `diagramInterfaces` state
- `useEffect` calls `data.loadDiagram(filter)` on filter or project change
- Registry panel still receives unfiltered `data.systems` / `data.interfaces`
- DiagramCanvas receives filtered `diagramSystems` / `diagramInterfaces`

### 2. Discussed and planned (not built)

#### Middleware chain concept
- Single `integration_platform TEXT` field is insufficient for multi-hop flows
- Proposed: replace with `middleware_chain JSONB` — ordered array of nodes
- Each node: `{ platform: string, label: string, transport: string, note: string }`
- Example: CPI → SFTP Server as two sequential middleware nodes

#### Interface dependencies concept
- When two interfaces are owned by different teams but one feeds the other, they need to be linked in the registry
- E.g. IF001 (SAP CPI, Team A) chains_to IF002 (MuleSoft, Team B)
- Dependencies are NOT shown on the Global Diagram — registry/Interface View only

#### Interface View tab (planned)
- New tab alongside Global Diagram
- Right panel: read-only interface list for project
- Canvas: one interface at a time, one line per receiver (not grouped), editable elements, saved to DB
- Elements: system_node, middleware_node, text, firewall, step, boundary
- Boxes expandable (resize height, body text editable)
- Toolbar: + Text, + Firewall, + Step, + Boundary, ⤢ Fit

---

## Current file structure (relevant files)

```
internal/ifregistry/
  handler.go          — route registration (022 routes + new diagram route)
  systems.go          — systems CRUD
  interfaces.go       — interfaces + receivers CRUD
  diagram.go          — NEW: SQL-filtered diagram endpoint
  config.go           — GET/PUT registry_config
  seed.go             — dev seed (30 systems, 200 interfaces)

internal/db/migrations/
  020_interface_registry.sql
  021_interface_registry_v2.sql
  022_interface_ref.sql          ← latest migration

web/src/pages/design/
  DesignPhase.tsx                ← DESIGN_NAV has 3 tabs: Projects, Templates, "Interface Diagram"
  diagram/
    DiagramView.tsx              ← no JS filter logic, calls loadDiagram
    DiagramCanvas.tsx            ← custom SVG canvas
    DiagramFilters.tsx           ← System, Status, Infra dropdowns
    InterfaceDetail.tsx          ← edit panel for one interface
    RegistryPanel.tsx            ← sidebar: all systems + interfaces
    useRegistryData.ts           ← data hook + loadDiagram
    types.ts                     ← all TypeScript types
```

---

## Interface data model (current)

**`interfaces` table key columns:**
- `sender_system_id UUID`
- `interface_ref TEXT` (10 char, partial unique index)
- `integration_platform TEXT` (single value — to be replaced)
- `cpi_package_id`, `cpi_iflow_id`, `transport`, `auth_type`, `credential_alias`
- `meta JSONB`

**`interface_receivers` table:**
- One row per receiver leg
- `system_id`, `cpi_iflow_id`, `transport`, `auth_type`, `credential_alias`, `meta JSONB`

---

## Next build — do these in order

### Step 1: Migration 023

File: `internal/db/migrations/023_middleware_chain_dependencies.sql`

```sql
-- Middleware chain: ordered list of platform hops within a single interface
ALTER TABLE interfaces
  ADD COLUMN middleware_chain JSONB NOT NULL DEFAULT '[]';

-- Interface dependencies: links between interfaces owned by different teams
CREATE TABLE interface_dependencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL,
  interface_id  UUID NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'chains_to',
  note          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (interface_id, depends_on_id)
);
CREATE INDEX ON interface_dependencies (interface_id);
CREATE INDEX ON interface_dependencies (depends_on_id);
```

`kind` values: `chains_to` | `triggers` | `shares_data`

### Step 2: Backend — middleware_chain + dependencies

**`internal/ifregistry/interfaces.go`:**
- Add `MiddlewareNode` struct: `{ Platform, Label, Transport, Note string }`
- Add `MiddlewareChain []MiddlewareNode` to `Interface` struct
- Add `middleware_chain` to `ifaceCols` constant (after `meta`, before `created_at`)
- Update `scanInterface` to scan `middleware_chain` as `json.RawMessage`
- Add `middleware_chain` to INSERT and UPDATE queries in `createInterface` / `updateInterface`

**New file: `internal/ifregistry/dependencies.go`**
- `InterfaceDependency` struct: `{ ID, ProjectID, InterfaceID, DependsOnID, Kind, Note, CreatedAt, DependsOnRef, DependsOnName }`
- Routes:
  - `GET /projects/{pid}/interfaces/{id}/dependencies` — list, join interfaces to get ref+name of depends_on
  - `POST /projects/{pid}/interfaces/{id}/dependencies` — body: `{ depends_on_id, kind, note }`
  - `DELETE /projects/{pid}/interfaces/{id}/dependencies/{did}`

**`internal/ifregistry/handler.go`** — register the 3 new dependency routes

### Step 3: Frontend — types + useRegistryData

**`web/src/pages/design/diagram/types.ts`:**
```ts
export interface MiddlewareNode {
  platform:  string
  label:     string
  transport: string
  note:      string
}

export interface InterfaceDependency {
  id:               string
  interface_id:     string
  depends_on_id:    string
  kind:             'chains_to' | 'triggers' | 'shares_data'
  note:             string
  depends_on_ref:   string
  depends_on_name:  string
}

// Add to IFInterface:
middleware_chain: MiddlewareNode[]
```

**`web/src/pages/design/diagram/useRegistryData.ts`** — add:
```ts
async function listDependencies(ifaceId: string): Promise<InterfaceDependency[]>
async function addDependency(ifaceId: string, body: { depends_on_id: string, kind: string, note: string }): Promise<void>
async function deleteDependency(ifaceId: string, did: string): Promise<void>
```

### Step 4: Frontend — InterfaceDetail updates

**`web/src/pages/design/diagram/InterfaceDetail.tsx`:**

Replace the single "Integration Platform" `<Select>` with a `MiddlewareChainEditor` component:
- Ordered list of middleware nodes
- Each row: platform dropdown (from config.platforms) + label input + transport input + note input + delete button + up/down reorder buttons
- "Add hop" button appends a blank entry
- Saves as part of the main interface form on Save

Add a `DependenciesSection` below the receivers section:
- Lists existing dependencies: `[ref] [name] [kind badge] [note] [delete button]`
- "Add dependency" form: select interface from project list + kind dropdown + note input + Add button
- Fetches dependencies on mount via `listDependencies`
- kind badge colours: chains_to=blue, triggers=orange, shares_data=grey

### Step 5: Tab rename + Interface View tab

**`web/src/pages/design/DesignPhase.tsx`:**
- Change `label: 'Interface Diagram'` → `label: 'Global Diagram'` in `DESIGN_NAV`
- Add: `{ id: 'interface-view', label: 'Interface View', icon: 'detail-view' }`
- Add render: `{id === 'interface-view' && <InterfaceView />}`

### Step 6: Migration 024 + canvas elements API

**`internal/db/migrations/024_interface_canvas.sql`:**
```sql
CREATE TABLE interface_canvas_elements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interface_id UUID NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  system_id    UUID REFERENCES systems(id) ON DELETE SET NULL,
  label        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  pos_x        FLOAT NOT NULL DEFAULT 0,
  pos_y        FLOAT NOT NULL DEFAULT 0,
  width        FLOAT NOT NULL DEFAULT 180,
  height       FLOAT NOT NULL DEFAULT 80,
  color        TEXT NOT NULL DEFAULT '',
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON interface_canvas_elements (interface_id);
```

`kind` values: `system_node` | `middleware_node` | `text` | `firewall` | `step` | `boundary`

**New file: `internal/ifregistry/canvas.go`**
- Routes:
  - `GET    /projects/{pid}/interfaces/{id}/canvas` — list all elements
  - `POST   /projects/{pid}/interfaces/{id}/canvas` — add element
  - `PUT    /projects/{pid}/interfaces/{id}/canvas/{eid}` — update (pos, size, label, body)
  - `DELETE /projects/{pid}/interfaces/{id}/canvas/{eid}` — delete (user-added kinds only)

### Step 7: Interface View frontend

**New files:**
- `web/src/pages/design/diagram/canvasUtils.ts` — extract `borderPoint()`, `dagreLayout()`, `snap()` from DiagramCanvas (shared with InterfaceCanvas)
- `web/src/pages/design/diagram/InterfaceListPanel.tsx` — read-only list, click to select, shows ref + name + status badge
- `web/src/pages/design/diagram/InterfaceCanvas.tsx` — editable canvas for one interface
- `web/src/pages/design/diagram/InterfaceView.tsx` — tab container

**InterfaceCanvas bootstrap logic:**
- On first load (no canvas elements in DB), auto-create:
  - `system_node` for sender
  - `system_node` for each receiver
  - `middleware_node` for each entry in `middleware_chain`
  - Dagre layout: sender left → middleware nodes centre → receivers right
  - Save all to DB immediately
- Subsequent loads: use saved positions

**InterfaceCanvas key differences from DiagramCanvas:**
- One line per receiver (not grouped by system pair)
- Resize handle on each box (drag bottom-right corner)
- Click body area to edit text (textarea, saves on blur)
- Toolbar buttons add new elements at a default position
- Boundary elements render at z-index below system boxes

---

## Build command

```bash
docker compose -f deployments/local/docker-compose.yml up --build interfaces portal
```

Only `interfaces` and `portal` need rebuilding for registry changes. Migrations run automatically on `interfaces` service startup (check: migrations currently run in `api` service — verify if `interfaces` also runs them or if they need to be added there).

> **Note:** Migrations 001–022 run in the `api` service. The `interfaces` service has its own migration runner for 020+. Check `cmd/interfaces/main.go` to confirm.
