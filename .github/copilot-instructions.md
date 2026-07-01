# Copilot Instructions for YAHAML

Follow `AGENTS.md` at repository root for operating principles.

## Primary priorities

1. Keep logging and contest behavior correct.
2. Keep radio/provisioning workflows stable and observable.
3. Prefer minimal, reversible changes with explicit validation.

## Before finalizing any implementation

- Build UI if UI/routing changed: `npm -C ui run build`
- Build API/shared code if `src/` changed: `npm run build`
- Report exact files changed and any user-visible behavior changes.

## Design expectations

- Maintain compatibility with existing API shapes unless asked otherwise.
- Respect deployment realities (Docker/container constraints).
- Preserve host/port intent in routing overrides.
- Avoid introducing secrets into logs, code, or docs.
