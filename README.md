# Yet Another Ham Logger (YAHAML)

> ⚠️ **Early Development**: This project is actively being developed and features are still stabilizing. Expect breaking changes, incomplete features, and rough edges. Use in production at your own risk!

Collaborative ham radio logging with a focus on **group/club workflows**, **UDP interoperability**, **remote rig control**, and **real-time updates**.

## Screenshots

*Coming soon - screenshots will be added as features are finalized*

## Quick Facts

- **Status:** 🚧 Early Development (Active development, Feb 2026)
- **Tests:** Jest + Supertest suite (run `npm test`)
- **Deployment:** Docker-ready, VPS/cloud compatible
- **Real-time:** WebSocket with auto-reconnect + WebRTC signaling
- **Features:** Contest templates, band tracking, rig control, audio monitoring, voice rooms

## Core Features

### 📻 Logging & QSO Management
- **Multi-user logging** by callsign with shared activity context (Field Day, POTA, SOTA, contests)
- **Real-time QSO sync** across all connected clients via WebSocket
- **Rich QSO data** with frequency, mode, band, RST, exchange fields, and notes
- **Session management** with auto-restore and token-based authentication
- **Activity feed** showing recent station activity in real-time

### 🎯 Contest Management
- **19 contest templates** including Field Day, CQ WPX, ARRL DX, Sweepstakes, and more
- **Dynamic scheduling** with contest instance creation and date management
- **Contest validation** with rules enforcement and exchange verification
- **Leaderboard tracking** for competitive events

### 🔊 Advanced Audio & Rig Control
- **Remote rig control** via HAMLib (rigctld) integration
- **Real-time audio monitoring** with Web Audio API
- **CW keying** with adjustable speed and automatic callsign playback
- **PTT control** with audio loopback for monitoring
- **Audio keep-alive** option to maintain connection across tab changes
- **Live audio meters** for monitoring signal levels

### �️ Voice Rooms & Streaming
- **WebRTC voice rooms** with signaling over WebSocket
- **Operator join/leave** with participant tracking and live status
- **PTT + mute controls** and per-room volume control
- **Radio audio sources**: loopback, Janus (optional), HTTP stream
- **Field-ready topology** for multi-operator coordination

### �🌐 Interoperability & Integration
- **UDP logging protocol** for N3FJP and other logging software
- **TCP relay mode** for N3FJP band occupancy tracking
- **ADIF export** for contact import/export with other logging tools
- **Cabrillo export** for contest log submission
- **HamDB/QRZ integration** for callsign lookups and validation

### 👥 Club & Special Event Operations
- **Club callsign management** for group operations
- **Special event station** support with shared logging
- **Band occupancy tracking** to coordinate multi-operator stations
- **Callsign rotation** for Field Day and other multi-transmitter events

### 🎨 Modern Web Interface
- **Responsive design** optimized for desktop, tablet, and mobile
- **Light/dark theme** with automatic system preference detection
- **Real-time updates** without page refreshes
- **Clean, intuitive UI** focused on efficient logging workflow

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
- **[Testing](docs/testing.md)** - Test patterns and coverage
- **[UI Design System](docs/ui-design-system.md)** - Component library and theming
- **[WebRTC Peer Connections](docs/webrtc-peer-connections.md)** - Signaling flow and ICE notes
- **[Janus Setup](docs/janus-setup.md)** - Optional media gateway setup
- **[Radio Audio Sources](docs/radio-audio-sources.md)** - Loopback vs Janus vs HTTP stream
- **[N3FJP Protocol](docs/protocol-summary.md)** - Protocol details and debugging

## How to Contribute
See [CONTRIBUTING.md](CONTRIBUTING.md).
