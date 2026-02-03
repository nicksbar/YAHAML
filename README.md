# Yet Another Ham Logger (YAHAML)

Collaborative ham radio logging with a focus on **group/club workflows**, **UDP interoperability**, **remote rig control**, and **real-time updates**.

## Quick Facts

- **Status:** ✅ Production-ready (Phase 5.1 complete, Feb 1, 2026)
- **Tests:** 213/213 passing
- **Deployment:** Ready for Docker, VPS, or cloud platforms
- **Real-time:** WebSocket with auto-reconnect
- **Features:** 19 contest templates, band occupancy tracking, event logging, ADIF/Cabrillo export

## Features
- Multi-user logging by callsign with shared activity context (Field Day, POTA, SOTA, contests)
- Real-time activity feed and station coordination
- Club and special event callsign management
- 19 contest templates with dynamic scheduling and validation
- Live band occupancy tracking with N3FJP relay integration
- Remote rig control via HAMLib (rigctld)
- UDP logging protocol support for interoperability
- Modern, responsive web interface with light/dark theme
- SQLite database with Prisma ORM

## Quick Start

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev:all

## Docker Deployment

### Option A: SQLite (file-backed)

```bash
docker compose up -d --build
```

- UI (root): http://localhost
- API: http://localhost:3000
- SQLite data: ./data/yahaml.db

### Option B: Postgres

```bash
docker compose -f docker-compose.postgres.yml up -d --build
```

Note: Postgres requires the Prisma datasource provider to be set to `postgresql` in [prisma/schema.prisma](prisma/schema.prisma). If you want this switch applied, ask and I’ll update it with the required migration guidance.

## Proxmox (helper script)

```bash
sudo bash scripts/proxmox-deploy.sh
```

Set `COMPOSE_FILE=docker-compose.postgres.yml` to deploy with Postgres.
```

Access the UI at http://localhost:5173

## Project Status

See [STATUS.md](STATUS.md) for detailed status, deployment readiness, and phase completion.

## Project Documentation

**Start here:** [docs/INDEX.md](docs/INDEX.md) - Complete documentation index

Key documents:
- **[Architecture](docs/architecture.md)** - System design, services, WebSocket real-time updates
- **[Deployment](docs/DEPLOYMENT_READINESS.md)** - Production deployment guide (Docker, VPS, Cloud)
- **[Testing](docs/testing.md)** - Test patterns and 213 passing tests
- **[UI Design System](docs/ui-design-system.md)** - Component library and theming
- **[N3FJP Protocol](docs/protocol-summary.md)** - Protocol details and debugging

## How to Contribute
See [CONTRIBUTING.md](CONTRIBUTING.md).
