# Yet Another Ham Logger (YAHAML)

Collaborative ham radio logging with a focus on **group/club workflows**, **UDP interoperability**, and **remote rig control**.

## Features
- Multi-user logging by callsign with shared activity context (Field Day, POTA, SOTA, contests)
- Real-time activity feed and station coordination
- Club and special event callsign management
- Contest templates and scoring
- Remote rig control via HAMLib (rigctld)
- UDP logging protocol support for interoperability
- Modern, responsive web interface
- SQLite database with Prisma ORM

## Quick Start

```bash
npm install
npm run db:generate
npm run db:push
npm run dev:all
```

Access the UI at http://localhost:5173

## Project Documentation
- Architecture: docs/architecture.md
- Deployment: DEPLOYMENT.md
- API Reference: See source code comments
- UI Design System: UI_DESIGN_SYSTEM.md

## How to Contribute
See CONTRIBUTING.md.
