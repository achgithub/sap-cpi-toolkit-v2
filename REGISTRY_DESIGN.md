# Integration Registry — Design V2

> Supersedes the registry sections of DESIGN.md.
> All data is seeded — full rebuild of the `interfaces` service schema is approved.

---

## Guiding Principles

- **Structured data drives diagrams.** No free-text step labels. Every visual element derives from a typed attribute.
- **Three distinct entity types.** Business systems, integration components, and infrastructure are never conflated.
- **Via hops are integration components only.** Business systems appear only as trigger source, sender, or receiver — never as a hop.
- **API means three different things.** Each is modelled separately.
- **Published APIs are catalogue entries.** They are registered but never diagrammed.

---

## Entity Types

### 1. Systems — business applications

Company-wide. These are the business systems that own or consume data.

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | TEXT | e.g. "SAP S/4HANA PRD", "Salesforce CRM" |
| system_type | TEXT | FK ref to config (e.g. "SAP S/4HANA", "Salesforce") |
| infra_type | TEXT | FK ref to config (e.g. "SAP BTP", "On-Prem") |
| infra_region | TEXT | e.g. "EU10", "Frankfurt DC" |
| owner_type | TEXT | internal / partner / external |
| description | TEXT | |
| pos_x, pos_y | FLOAT | position on architecture canvas |

**Config (registry_config key `system_types`):** name + colour. Managed in Registry Settings.

---

### 2. Integration Components — middleware and tools

Company-wide. These are the platforms, tools, and components that move, transform, or trigger data. They appear as via hops and as triggers.

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | TEXT | e.g. "SAP CPI PRD", "MuleSoft EU", "SFTP Gateway" |
| component_type | TEXT | FK ref to config (see types below) |
| infra_type | TEXT | FK ref to infra config — what it runs on |
| infra_region | TEXT | e.g. "EU10", "eu-west-1" |
| description | TEXT | |

**Component types (config key `component_types`):** name + colour.
Seed values: `SAP CPI`, `MuleSoft`, `SFTP`, `API Gateway`, `Event Bus`, `Message Queue`, `Custom`.

**Replaces:** the old `integration_platforms` config list (which had no infra, no instances).

---

### 3. Infrastructure — environments

Config only (registry_config key `infra_types`). Name + category (cloud / on_prem / hybrid).
Examples: `SAP BTP`, `AWS`, `Azure`, `On-Prem DC`, `Salesforce Cloud`.

No separate table needed — systems and components carry their `infra_type` as a string referencing this config.

---

### 4. Logical Groups

Unchanged. Optional grouping of interfaces for the group flow diagram.

| Field | Notes |
|---|---|
| id, name, description | |
| flow_diagram_state JSONB | freeform canvas state |

---

## Interface — complete model

### Identity & classification

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| name | TEXT | |
| ref | TEXT(10) | unique 10-char commercial reference |
| build_ref | TEXT | RICEF / JIRA / ticket |
| status | TEXT | design / dev / test / active / deprecated |
| interface_type | TEXT | see types below |
| functional_domain | TEXT | Order to Cash, Finance, HR etc. |
| logical_group_id | UUID? | FK → logical_groups |
| sequence_in_group | INT? | ordering within group |
| description | TEXT | |

**Interface types:**

| Value | Diagrams | Notes |
|---|---|---|
| `point_to_point` | All | Single sender path, single receiver |
| `broadcast` | All | Single sender path, multiple receivers |
| `shared_library` | All | Reusable package, no fixed system pair |
| `utility` | All | Internal tool/job |
| `published_api` | None | Catalogue entry only — see API types below |

---

### Trigger — who or what initiates this interface

| Field | Type | Notes |
|---|---|---|
| trigger_type | TEXT | see types below |
| trigger_system_id | UUID? | FK → systems — set when a business system pushes |
| trigger_component_id | UUID? | FK → integration_components — set when a component triggers |
| schedule_expression | TEXT? | human-readable schedule e.g. "Daily 02:00 UTC", "Hourly" |
| source_system_id | UUID? | FK → systems — where data is read from when trigger ≠ source |

**Trigger types:**

| Value | Meaning | Example |
|---|---|---|
| `system_push` | Business system initiates | SAP ECC sends IDoc |
| `component_scheduled` | Integration component runs on a timer | CPI job fetches SF daily |
| `component_event` | Integration component reacts to an event | CPI listens on event bus |
| `api_inbound` | Interface exposed as HTTP endpoint, caller triggers it | REST webhook receiver |

**Trigger vs source distinction:**
- `component_scheduled`: trigger = CPI, source = SuccessFactors (being polled)
- `system_push`: trigger = system, source = same system (trigger_system_id = source_system_id, source can be omitted)
- `api_inbound`: trigger = inbound HTTP call, no trigger_system_id or trigger_component_id set; source_system_id = caller if known

---

### Interaction pattern

| Field | Type | Notes |
|---|---|---|
| interaction_pattern | TEXT | sync / async / event / scheduled |

| Value | Visual indicator |
|---|---|
| `sync` | Solid double-headed arrow (request + response) |
| `async` | Single arrow, dashed |
| `event` | Lightning bolt badge on trigger |
| `scheduled` | Clock badge on trigger, schedule label |

---

### Via — shared integration path

```jsonc
// via JSONB — ordered array, applies to all receivers
[
  {
    "type": "component",
    "component_id": "uuid",   // FK → integration_components
    "label": "SAP CPI PRD"    // denormalised name for display
  },
  {
    "type": "component",
    "component_id": "uuid",
    "label": "SFTP Gateway"
  }
]
```

**Rules:**
- Only `component` hop type in the shared `via`.
- Business systems never appear here.
- `api_call` steps (see below) never appear in the shared via — they are per-receiver only.

---

## Interface Receivers

One row per receiver leg. Supports point-to-point (one receiver) and broadcast (many).

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| interface_id | UUID | FK → interfaces |
| system_id | UUID? | FK → systems — the destination business system |
| transport | TEXT | HTTP / SFTP / RFC / IDoc / AS2 / JDBC / AMQP / SOAP |
| auth_type | TEXT | None / Basic / OAuth2 / ClientCert / APIKey |
| credential_alias | TEXT | |
| via | JSONB | per-receiver hops — see below |

**Per-receiver via** — hops between the last shared hop and this receiver:

```jsonc
[
  {
    "type": "component",
    "component_id": "uuid",
    "label": "MuleSoft EU"
  },
  {
    "type": "api_call",
    "label": "Map Customer Numbers",
    "system_id": "uuid",        // FK → systems — which system exposes this API
    "system_label": "MDG PRD"   // denormalised for display
  }
]
```

**Hop types in receiver via:**

| Type | Appears in | Notes |
|---|---|---|
| `component` | Group diagram + Detailed flow | Integration component hop |
| `api_call` | Detailed flow only | Mid-flow API call to a system; invisible in architecture + group diagrams |

---

## API Types — three distinct concepts

### Type 1 — API call as a mid-flow step
Modelled as an `api_call` hop in receiver `via`. Captures: label (what the call does), which system exposes the API, and position in the flow. Appears in the detailed interface flow diagram only. Not visible in architecture or group diagrams.

### Type 2 — Published API service
`interface_type = published_api`. Captured in the registry for build tracking, documentation, and governance (swagger URL, auth scheme, etc.). **Never diagrammed.** No flow diagram tab is rendered. May have multiple consumers but these are not tracked per-interface — out of scope for now.

Additional fields on interfaces where `interface_type = published_api`:

| Field | Notes |
|---|---|
| api_spec_url | OpenAPI / Swagger URL |
| api_auth_scheme | ApiKey / OAuth2 / Basic / None |
| api_description | What this API provides |

These fields are nullable on all other interface types.

### Type 3 — HTTP inbound trigger
A normal interface (any `interface_type`) with `trigger_type = api_inbound`. The interface is exposed as an HTTP endpoint and an external caller triggers it. Diagrams normally. No special modelling beyond the trigger type.

---

## Interface Dependencies

Unchanged from current model.

| Field | Notes |
|---|---|
| interface_id, depends_on_id | both FK → interfaces |
| kind | chains_to / triggers / shares_data |
| note | |

---

## Custom Fields — organisation-defined attributes

Each organisation will need to capture information beyond the core schema (business owner, SLA, data classification, error contact, etc.). These are global — not project-scoped. The project concept is dropped from the registry entirely.

**Design:** one definition table, two value tables (one per level). Definitions are the key linking everything. No schema changes needed to add a new field — create a definition row and it appears immediately.

### `interface_field_definitions`

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| applies_to | TEXT | `interface` / `receiver` / `both` |
| field_key | TEXT | machine key, unique e.g. `business_owner` |
| label | TEXT | display label e.g. "Business Owner" |
| data_type | TEXT | `text` / `number` / `date` / `boolean` / `select` / `url` |
| options | JSONB? | for `select` — ordered list e.g. `["Low","Medium","High"]` |
| required | BOOLEAN | |
| display_order | INT | ordering in form / report |
| description | TEXT? | help text |

**Unique constraint:** `(field_key, applies_to)`

### `interface_field_values` — values at interface level

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| interface_id | UUID | FK → interfaces |
| definition_id | UUID | FK → interface_field_definitions |
| value | TEXT | stored as text; cast on read using definition `data_type` |

**Unique constraint:** `(interface_id, definition_id)`

### `receiver_field_values` — values at receiver level

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| receiver_id | UUID | FK → interface_receivers |
| definition_id | UUID | FK → interface_field_definitions |
| value | TEXT | |

**Unique constraint:** `(receiver_id, definition_id)`

---

### How it works

**Adding a field:** create a row in `interface_field_definitions`. Immediately available across all interfaces. No migration needed.

**Reporting:**
```sql
SELECT i.ref, i.name, fd.label, ifv.value
FROM interfaces i
JOIN interface_field_values ifv ON ifv.interface_id = i.id
JOIN interface_field_definitions fd ON fd.id = ifv.definition_id
ORDER BY fd.display_order
```

**Diagram isolation:** diagram queries never touch these tables. Custom fields are loaded only in detail/report views.

---

### Migrations

| # | Description |
|---|---|
| 032 | `interface_field_definitions` |
| 033 | `interface_field_values` |
| 034 | `receiver_field_values` |

### API routes

```
GET    /field-definitions
POST   /field-definitions
PUT    /field-definitions/{id}
DELETE /field-definitions/{id}         -- cascades values

GET    /interfaces/{id}/fields         -- [{definition_id, key, label, type, value}]
PUT    /interfaces/{id}/fields         -- upsert [{definition_id, value}]

GET    /interfaces/{id}/receivers/{rid}/fields
PUT    /interfaces/{id}/receivers/{rid}/fields
```

### Go structs

```go
type FieldDefinition struct {
    ID           string   `json:"id"`
    AppliesTo    string   `json:"applies_to"`
    FieldKey     string   `json:"field_key"`
    Label        string   `json:"label"`
    DataType     string   `json:"data_type"`
    Options      []string `json:"options"`
    Required     bool     `json:"required"`
    DisplayOrder int      `json:"display_order"`
    Description  string   `json:"description"`
}

type FieldValue struct {
    DefinitionID string `json:"definition_id"`
    FieldKey     string `json:"field_key"`
    Label        string `json:"label"`
    DataType     string `json:"data_type"`
    Value        string `json:"value"`
}
```

### Frontend

**UI deferred — backend only for now.** Tables and API routes are built. UI is added when the Reports tab is built. When custom field values are returned alongside an interface, the detail view renders them in a collapsible "Custom Fields" section. Field management lives in Toolbox → Registry Settings.

---

## Diagram Cascade

All diagrams derive from structured data. No manual step labels.

### Architecture diagram
Draws system-to-system edges. Source of nodes: trigger_system_id / source_system_id → receiver.system_id.

| Attribute | Effect |
|---|---|
| trigger_type | Arrow style (push = solid out, scheduled = clock on source node) |
| interaction_pattern | Edge style (sync = bidirectional, async = dashed) |
| status | Edge colour (design/dev/test/active/deprecated) |
| Via hops | Not shown |
| api_call hops | Not shown |

### Group flow diagram
Draws component hops shared across the group's interfaces. Per-receiver legs with component hops.

| Attribute | Effect |
|---|---|
| trigger node | Component box (if component_scheduled/event) or System box (if system_push/api_inbound) |
| schedule_expression | Label under trigger node |
| via[type=component] | Component box in sequence |
| receivers | System box per receiver |
| receiver via[type=component] | Additional component box per leg |
| api_call hops | Hidden |
| interaction_pattern | Arrow decoration |

### Detailed interface flow diagram
Full fidelity. Everything visible.

| Attribute | Effect |
|---|---|
| All of the above | As above |
| api_call hops | Shown as a step box with callout to the target system |
| api_call.system_id | Callout line to named system box |
| published_api | No diagram tab rendered |

---

## Migration Plan

Drop and replace migrations 026–030 (interface registry rebuild). New sequence:

| # | Description |
|---|---|
| 026 | `integration_components` table |
| 027 | `logical_groups` table |
| 028 | `interfaces` — trigger_type, trigger_system_id, trigger_component_id, source_system_id, interaction_pattern, schedule_expression, api_spec_url, api_auth_scheme, api_description |
| 029 | `interface_receivers` — via uses typed hops (component / api_call) |
| 030 | `interface_dependencies` table |
| 031 | `registry_config` seed — component_types, system_types, infra_types |
| 032 | `interface_field_definitions` — custom fields schema |
| 033 | `interface_field_values` — values at interface level |
| 034 | `receiver_field_values` — values at receiver level |

**Removed columns vs current schema:**
- `sender_system_id` → replaced by `trigger_system_id` + `trigger_type` + `source_system_id`
- `sender_step_label`, `receiver_step_label` → dropped (derived from structured data)
- `interfaces.flow_diagram_state` → retained (freeform canvas overlay)
- Via `system_id` → replaced by typed hop with `component_id` or `system_id` depending on `type`

**Systems table:** unchanged. Existing systems that are actually integration components are moved to `integration_components` at reseed time.

---

## Go Structs (interfaces service)

```go
// integration_components
type Component struct {
    ID          string `json:"id"`
    Name        string `json:"name"`
    ComponentType string `json:"component_type"`
    InfraType   string `json:"infra_type"`
    InfraRegion string `json:"infra_region"`
    Description string `json:"description"`
}

// via hop — shared interface via and receiver via
type Hop struct {
    Type        string  `json:"type"`                   // "component" | "api_call"
    Label       string  `json:"label"`
    ComponentID *string `json:"component_id,omitempty"` // type=component
    SystemID    *string `json:"system_id,omitempty"`    // type=api_call
    SystemLabel *string `json:"system_label,omitempty"` // type=api_call (denormalised)
}

type Receiver struct {
    ID              string  `json:"id"`
    InterfaceID     string  `json:"interface_id"`
    SystemID        *string `json:"system_id"`
    Transport       string  `json:"transport"`
    AuthType        string  `json:"auth_type"`
    CredentialAlias string  `json:"credential_alias"`
    Via             []Hop   `json:"via"`
}

type Interface struct {
    ID                 string     `json:"id"`
    Name               string     `json:"name"`
    Ref                string     `json:"ref"`
    BuildRef           string     `json:"build_ref"`
    Status             string     `json:"status"`
    InterfaceType      string     `json:"interface_type"`
    FunctionalDomain   string     `json:"functional_domain"`
    LogicalGroupID     *string    `json:"logical_group_id"`
    SequenceInGroup    *int       `json:"sequence_in_group"`
    Description        string     `json:"description"`

    // Trigger
    TriggerType         string  `json:"trigger_type"`
    TriggerSystemID     *string `json:"trigger_system_id"`
    TriggerComponentID  *string `json:"trigger_component_id"`
    ScheduleExpression  *string `json:"schedule_expression"`
    SourceSystemID      *string `json:"source_system_id"`

    // Interaction
    InteractionPattern string `json:"interaction_pattern"`

    // Published API extras (nullable on other types)
    APISpecURL     *string `json:"api_spec_url,omitempty"`
    APIAuthScheme  *string `json:"api_auth_scheme,omitempty"`
    APIDescription *string `json:"api_description,omitempty"`

    // Path
    Via       []Hop      `json:"via"`
    Receivers []Receiver `json:"receivers"`

    FlowDiagramState *json.RawMessage `json:"flow_diagram_state,omitempty"`
}
```

---

## API Routes (interfaces service)

All under `/api/interfaces/`.

```
// Integration components (new)
GET    /components            list all
POST   /components            create
PUT    /components/{id}       update
DELETE /components/{id}       delete

// Systems (unchanged)
GET    /systems
POST   /systems
PUT    /systems/{id}
DELETE /systems/{id}

// Logical groups (unchanged)
GET    /logical-groups
POST   /logical-groups
PUT    /logical-groups/{id}
DELETE /logical-groups/{id}
GET    /logical-groups/{id}/flow-diagram
PUT    /logical-groups/{id}/flow-diagram

// Interfaces (updated fields)
GET    /interfaces             list (filter: status, type, trigger_type, interaction_pattern, system_id, component_id, functional_domain, group_id, logical_group_id)
POST   /interfaces
GET    /interfaces/{id}
PUT    /interfaces/{id}
DELETE /interfaces/{id}
GET    /interfaces/{id}/flow-diagram
PUT    /interfaces/{id}/flow-diagram

// Receivers (unchanged structure, updated via hop type)
POST   /interfaces/{id}/receivers
PUT    /interfaces/{id}/receivers/{rid}
DELETE /interfaces/{id}/receivers/{rid}

// Dependencies (unchanged)
GET    /interfaces/{id}/dependencies
POST   /interfaces/{id}/dependencies
DELETE /interfaces/{id}/dependencies/{did}

// Diagram (updated — returns component nodes too)
GET    /diagram               architecture edges (system→system, aggregated)

// Config (add component_types key)
GET    /config/{key}
PUT    /config/{key}
```

---

## Frontend Changes

### Registry Settings (Toolbox)
- **Add:** Integration Components section — CRUD with component_type dropdown + infra fields
- **Add:** Component Types config section (name + colour) — replaces Integration Platforms
- **Remove:** Integration Platforms section
- **Keep:** System Types, Infrastructure Types, Systems — unchanged

### Registry Grid (Design → Registry)
- **Update:** Interface form — replace `sender_system_id` with trigger section (trigger_type selector, then conditional fields: trigger_system / trigger_component / schedule_expression / source_system)
- **Add:** `interaction_pattern` dropdown
- **Add:** Published API fields (conditional on interface_type = published_api): spec URL, auth scheme
- **Update:** ViaEditor — component picker pulls from `/components`, not systems; no system_id hops in shared via
- **Update:** Receiver ViaEditor — supports both `component` and `api_call` hop types; api_call picker shows systems
- **Remove:** sender_step_label, receiver_step_label fields

### Architecture Canvas
- **Update:** Diagram seeder — trigger_system_id / source_system_id → receiver.system_id for edges
- **Update:** Edge style — sync/async/scheduled/event visual differences
- **Keep:** Drag, pan, zoom, edge colour, filters — all unchanged

### Flow Diagram (group and detailed)
- **Update:** Reseed logic — reads trigger (system or component box at start), shared via (component boxes), receivers (system boxes), receiver via (component + api_call boxes)
- **Update:** api_call hop renders as a step box with a callout line to the target system box
- **Add:** Clock / lightning / schedule label on trigger node based on interaction_pattern
- **Keep:** Freeform canvas editing, save, all existing tools — unchanged

### System View (Design → Systems)
- No changes — still reads systems list + interface counts

---

## What Does Not Change

- `api` service and migrations 001–025
- Projects, CPI, Develop, Test, Monitoring, SFTP, Assets, Mock Server
- Docker Compose, portal proxy, auth, Groovy runner
- Architecture canvas pan/zoom/drag/filter mechanics
- Flow canvas tools (select, drag, resize, line drawing, save)
- All non-registry toolbox tools

---

## Build Order

1. **Migrations** — drop 026–030, write new 026–031
2. **Go structs + store** — Component CRUD, update Interface struct + queries
3. **Registry Settings** — Integration Components section, remove old Platforms section
4. **Registry Grid** — updated interface form (trigger, interaction_pattern, via editors)
5. **Architecture canvas reseed** — updated edge source logic
6. **Flow diagram reseed** — trigger node, component hops, api_call steps
7. **System View** — verify counts still work (no change expected)

---

## Open Questions (deferred)

- Published API consumer tracking (who is subscribed)
- Event bus topic/channel modelling
- API call hop: link to a specific interface in the registry (if the mapping API is itself registered)
- Spec generation from flow diagram
- CPI artifact linking
