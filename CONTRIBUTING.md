# Contributing to SAP CPI Toolkit

Thank you for your interest in contributing. This document covers how to get the development environment running, the branching and PR workflow, and the code standards we apply.

## Where to Start

Browse the [open issues](https://github.com/achgithub/sap-cpi-toolkit-v2/issues) on GitHub. Issues labelled [`good first issue`](https://github.com/achgithub/sap-cpi-toolkit-v2/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are scoped and self-contained — a good place to get familiar with the codebase. Issues labelled [`help wanted`](https://github.com/achgithub/sap-cpi-toolkit-v2/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) are open for anyone to pick up.

If you want to work on something, comment on the issue so we can avoid duplicated effort.

## Getting Started

### Prerequisites

- Docker + Docker Compose (all build steps run inside containers — no local Go or Node.js needed)
- Git

### Clone and run

```bash
git clone https://github.com/achgithub/sap-cpi-toolkit-v2.git
cd sap-cpi-toolkit-v2

docker compose -f deployments/local/docker-compose.yml up --build
```

Open [http://localhost:3000](http://localhost:3000). The database schema is applied automatically on first start.

### Rebuilding a single service after changes

```bash
# Portal (React UI)
docker compose -f deployments/local/docker-compose.yml up --build portal

# API backend
docker compose -f deployments/local/docker-compose.yml up --build api

# Interface registry service
docker compose -f deployments/local/docker-compose.yml up --build interfaces
```

### Viewing logs

```bash
docker compose -f deployments/local/docker-compose.yml logs -f
```

### Tearing down

```bash
# Stop containers only (data is preserved)
docker compose -f deployments/local/docker-compose.yml down

# Stop and delete all data volumes — only when you want a clean slate
docker compose -f deployments/local/docker-compose.yml down -v
```

## Project Structure

```
cmd/            Go service entry points (api, interfaces)
internal/       Go application code
  api/          CPI, scaffold, assets, monitoring, test pack handlers
  ifregistry/   Interface registry handlers
  db/           Database layer + migrations
web/            React frontend (Vite + TypeScript + @ui5/webcomponents-react)
  src/
    pages/      Phase-level views (design, develop, test, monitoring)
    tools/      Toolbox overlays
    components/ Shared UI components
deployments/    Docker Compose config + Dockerfiles
groovy-runner/  JVM Groovy execution service
sftp-server/    SFTP simulator
```

## Workflow

1. **Open an issue** before starting significant work so the approach can be agreed on.
2. **Branch** from `main` using the pattern `feat/<short-description>` or `fix/<short-description>`.
3. **Commit** with short, descriptive messages in the imperative mood ("Add X", "Fix Y", "Remove Z").
4. **Open a PR** against `main`. Fill in the description with what changed and how to test it.
5. PRs require at least one review before merge.

## Code Standards

### Go

- Standard `gofmt` formatting — the build will reject unformatted code.
- Return errors; do not panic in request handlers.
- Never return `err.Error()` directly to the HTTP client — log it, return a generic message.
- Always check `err != nil` (→ 500) separately from `rows.RowsAffected() == 0` (→ 404).
- Use `crypto/rand` for any generated IDs, refs, or tokens. Never use `math/rand`.
- Wrap request bodies in `http.MaxBytesReader` before decoding (default cap: 4 MB).

### TypeScript / React

- All new components in TypeScript with explicit prop types.
- Prefer editing existing components over creating new abstractions.
- Use `@ui5/webcomponents-react` for all UI elements — do not introduce additional component libraries.
- No inline styles for layout that belongs in a shared component.

### Security

The security backlog is documented in [CLAUDE.md](CLAUDE.md) under **Security Backlog**. Please do not reintroduce any of the listed anti-patterns when touching related files. The key rules are:

- Validate and blocklist outbound URLs before making proxied HTTP requests (SSRF prevention).
- Never interpolate query parameters directly into OData `$filter` strings.
- Use `http.MaxBytesReader` before decoding request bodies.
- Secrets in production must come from Kubernetes Secrets — never hardcode or default to zero/dev values.

## Database Migrations

Migrations live in `internal/db/migrations/` and are applied by the `api` service on startup.

- Name new migrations sequentially: `NNN_short_description.sql`
- Each migration must be idempotent (use `IF NOT EXISTS`, `IF EXISTS`, etc.).
- Test the migration by starting the stack from scratch (`down -v` then `up --build`).

## Reporting Bugs

Open an issue on GitHub with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- SAP CPI tenant region / version if relevant

## Requesting Features

Open an issue with the label `enhancement`. Describe the use case — not just the implementation — so it can be discussed before any code is written.
