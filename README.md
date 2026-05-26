# SAP CPI Toolkit

A developer toolkit for SAP Cloud Platform Integration (CPI) teams. Designed around the integration delivery journey: **Design → Develop → Test**.

## What It Does

The toolkit gives integration developers a single place to manage the full lifecycle of SAP CPI interfaces:

- **Interface Registry** — company-wide catalogue of integration interfaces with architecture and flow diagram visualisation
- **IFlow Scaffolding** — template-driven scaffolding for common adapter patterns, deployable straight to a CPI tenant
- **Development Tools** — Groovy IDE, HTTP client, formatter, EDI tools, XSLT map editor, comparator, asset library
- **Test Tooling** — test packs, volume runner, mock HTTP server, SFTP simulator, test data generation
- **Monitoring** — message monitoring and failed message management per CPI tenant (coming soon)
- **Toolbox** — security utilities, Cloud Connector browser, scheduled jobs, adapter template library

## Status

| Phase | Status |
|---|---|
| Develop | Available |
| Test | Available |
| Design (Interface Registry) | In development |
| Monitoring | In development |

## Quick Start

The entire stack runs in Docker — no local Go or Node.js installation required.

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/achgithub/sap-cpi-toolkit-v2.git
cd sap-cpi-toolkit-v2

docker compose -f deployments/local/docker-compose.yml up --build
```

Open [http://localhost:3000](http://localhost:3000).

On first start the database schema is applied automatically. You will be prompted to add a CPI project (tenant URL + OAuth credentials) through the Settings panel.

## Architecture

| Service | Port | Description |
|---|---|---|
| portal | 3000 | React UI — proxies all API traffic |
| api | 8080 | Go backend — CPI, scaffold, assets, test packs, monitoring |
| interfaces | 8083 | Interface registry service |
| groovy-runner | 8082 | JVM-based Groovy execution sandbox |
| sftp-server | 2222 | SFTP simulator |
| postgres | 5432 | All persistent state |

The portal proxies `/api/v2/*` to the `api` service and `/api/interfaces/*` to the `interfaces` service. Neither backend service is directly exposed.

## Configuration

Settings are managed through the in-app Settings panel (gear icon). There is no manual config file to edit for normal use.

For local development, copy `.env.example` to `.env` in `deployments/local/` and adjust as needed.

## Deployment

Production target is **Kyma (Kubernetes on SAP BTP)**. Docker Compose is for local development only.

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## License

MIT
