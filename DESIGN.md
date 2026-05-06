# SAP CPI Toolkit V2 — Design Plan (Rebuild)

> Reference backup: git tag `v0.1-interface-registry-backup`

## Context

The V1 approach scoped everything (systems, interfaces) to a project. This doesn't model
reality: the interface registry needs to be company-wide and outlive any delivery project.
This document defines the clean rebuild.

---

## Core Principle

**The registry is company-wide. Projects are a lens on top of it, not a container.**

One company per installation. Systems and interfaces exist at the organisation level.
A project references interfaces; it does not own them.

---

## Entities

### System *(company-wide)*
| Field | Notes |
|---|---|
| id, name | |
| system_type | e.g. SAP S/4HANA, Salesforce, Custom |
| infra_type | e.g. On-Prem, AWS, Azure |
| infra_region | e.g. eu-west-1, Frankfurt |
| description | |
| owner_type | internal / partner / external |
| pos_x, pos_y | position on architecture diagram |

### Logical Group *(optional grouping of interfaces)*
| Field | Notes |
|---|---|
| id, name, description | e.g. "SAP–SF Order Sync", "EDI Inbound" |

A logical group can span multiple functional domains (e.g. EDI carries both Order to Cash and Finance interfaces).
A logical group has a Flow Diagram showing all its interfaces together.
An interface without a logical group has its own standalone Flow Diagram.

### Interface *(company-wide)*
| Field | Notes |
|---|---|
| id, name | |
| ref | 10-char unique reference (commercial identifier) |
| build_ref | RICEF ID, JIRA ticket, or other commercial/internal tracking reference |
| status | design / dev / test / active / deprecated |
| interface_type | point_to_point / broadcast / shared_library / utility |
| sender_system_id | FK → systems (nullable for shared_library/utility) |
| logical_group_id | FK → logical_groups (nullable — standalone if absent) |
| sequence_in_group | ordering within the flow diagram (nullable — only in group context) |
| sender_step_label | e.g. "3 Pick Order" (nullable — only meaningful in a group) |
| receiver_step_label | e.g. "3b Notification order picked" (nullable) |
| functional_domain | for standalone interfaces only — same concept as logical_group.functional_domain |
| delivery_project_id | FK → projects (nullable — which project built this) |
| description | |

### Interface Receiver *(one row per receiver leg)*
| Field | Notes |
|---|---|
| interface_id, system_id | |
| transport | HTTP / SFTP / RFC / IDoc / AS2 etc. |
| auth_type | None / Basic / OAuth2 / ClientCert / APIKey |
| credential_alias | |

### Interface Dependency *(impact analysis)*
| Field | Notes |
|---|---|
| interface_id, depends_on_id | both FK → interfaces |
| kind | chains_to / triggers / shares_data |
| note | |

### Project *(delivery container only)*
| Field | Notes |
|---|---|
| id, name, description | |
| status | active / closed |

Projects are referenced by interfaces. The registry does not require a project.

### Registry Config *(global key/value)*
system_types (name + colour), infra_types (name + category), integration_platforms

---

## Four Views

### 1. Architecture Diagram
- **Scope**: company-wide, all systems
- **Shows**: system boxes, interface count badges on edges between systems
- **Filters**: infra_type, system, status, functional_domain, delivery_project
- **Interaction**: click edge/system → floating popup card
  - Card shows: name, ref, status, sender→receiver, logical group
  - Card actions: **Registry** (open detail) | **Flow Diagram** (open group/standalone diagram)
- **Use case**: orientation, discussion, impact analysis by filtering

### 2. Delivery / Support Flow Diagram
- **Scope**: per logical group, or per standalone interface
- **Shows**: sender system column | middleware | receiver system column
  - Numbered interface steps as labelled arrows
  - Free text annotations between steps (local process steps, not in registry)
  - Firewalls as vertical boundary lines
  - Intermediate components (SFTP server, queue etc.) — diagram-only, not in system registry
- **Use case**: delivery documentation, developer handoff, support reference

### 3. Registry Grid
- **Scope**: company-wide
- **Shows**: all interfaces in a sortable/filterable table
- **Filters**: status, interface_type, functional_domain, delivery_project, sender system, infra_type
- **Interaction**: click row → full interface detail page (edit, receivers, dependencies)
- **Use case**: managing the registry, reporting

### 4. System View
- **Type**: table (not a diagram)
- **Scope**: per system
- **Shows**: all interfaces where this system is sender or receiver
- **Use case**: "what touches this system?", support, impact per system

---

## UX Pattern

**Diagrams are navigation surfaces, not editing surfaces.**

- Diagrams take full available screen space — no permanent side panels
- Click on architecture diagram → small floating popup card (essentials only)
- Popup card has two action buttons → navigate to Registry detail or Flow Diagram
- Editing happens in dedicated pages (Registry detail, System detail)

---

## Navigation Structure (proposed)

```
[ Architecture ] [ Registry ] [ Systems ] [ Projects ]

Architecture → full-screen diagram
  → click → popup card → Registry | Flow Diagram

Registry → grid table
  → click row → Interface detail page
    → tabs: Overview | Receivers | Dependencies | Flow Diagram

Systems → list → System detail (table of interfaces)

Projects → list → Project detail (interfaces scoped to this project)
```

---

## Build Order

### Phase 1 — Database
Clean migrations (new sequence from 001):
- 001: systems
- 002: logical_groups
- 003: interfaces
- 004: interface_receivers
- 005: interface_dependencies
- 006: projects
- 007: registry_config

### Phase 2 — Backend (interfaces service)
CRUD for all entities. Diagram endpoint (company-wide, no project scope).
Filter params: infra_types, systems, statuses, functional_domain, delivery_project.

### Phase 3 — Architecture Diagram
Port ELK canvas from backup. Adapt to company-wide scope.
Add popup card component. Add filter bar.

### Phase 4 — Registry Grid
Sortable/filterable table. Interface detail page with tabs.

### Phase 5 — Flow Diagram
Per logical group (or standalone interface). Structured column layout.
Numbered steps auto-generated from interface data. Free text + firewall canvas elements.

### Phase 6 — System View + Projects
System detail table. Project scoped view.

---

## Scope

**Only these are touched:**
- `internal/ifregistry/` — interfaces Go service (full rewrite)
- Interfaces service migrations (020–025 reset, new schema)
- `web/src/pages/design/diagram/` — Diagram page (rewrite)
- `web/src/pages/design/` — new Registry page added

**Untouched:**
- `api` service and its migrations (001–019)
- Projects, Develop/CPI, Test, Monitoring, SFTP, Assets pages
- Docker compose, portal proxy, auth

## What We Port from Backup

| Thing | Decision |
|---|---|
| ELK layout engine + Vite shim | Port — keep as-is |
| SVG canvas approach | Port — adapt for flow diagram |
| pgx/v5 + scanFn pattern | Port |
| UI5 Web Components | Port |
| Docker compose + multi-stage builds | Port — untouched |
| registry_config concept | Port |
| project-scoped routes/state | Drop |
| middleware_chain JSONB | Drop — replaced by receivers + dependencies |
| interface_canvas_elements | Drop — redesigned as flow diagram |
| InterfaceDetail side panel | Drop — replaced by popup card + detail page |

---

## Open Questions (deferred)

- Spec generation from flow diagram (AI-assisted) — Phase 2+ feature
- CPI artifact linking (test_sender, exception_handler etc.) — Phase 2+ feature
- Authentication / multi-user — follow existing IAS auth pattern

## TODO (backlog)

- [ ] Customise dropdowns — system_type, infra_type, integration platform values editable via Registry Settings (currently seeded defaults only)
