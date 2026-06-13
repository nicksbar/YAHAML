# Project Structure

Current repository layout:

- `src/` - API server, relay, UDP handling, contest logic, exports, and shared services
- `ui/` - React + Vite frontend, components, hooks, audio, and styles
- `prisma/` - Prisma schema, migrations, and seed data
- `tests/` - Jest and integration test coverage
- `playwright/` - Browser test coverage
- `scripts/` - Operational helpers and relay tooling
- `docs/` - Architecture, protocol, deployment, and research documentation
- `docker-compose.yml` and `docker-compose.postgres.yml` - Local deployment entry points

Notable top-level files:

- `README.md` - Project overview and quick start
- `STATUS.md` - Current project status and rollout notes
- `package.json` - Server scripts and test commands
- `ui/package.json` - Frontend scripts and build commands

For the most current implementation details, start with `src/index.ts`, `src/relay.ts`, and `ui/src/App.tsx`.
