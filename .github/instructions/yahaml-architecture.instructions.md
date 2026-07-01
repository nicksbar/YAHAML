---
description: "Use when changing YAHAML logging, contest, rig, provisioning, websocket, or routing behavior. Applies architecture and operational guardrails."
applyTo: "src/**/*.ts,ui/src/**/*.ts,ui/src/**/*.tsx,prisma/**/*.prisma,docs/**/*.md"
---

# YAHAML Architecture-Aware Instructions

## Preserve operational intent

- Optimize for field reliability and operator clarity.
- Keep multi-operator shared state coherent.
- Favor deterministic and observable behavior over implicit magic.

## Change sensitivity map

### High-risk areas

- `src/index.ts` API routes and session/auth flow
- QSO logging, dedupe, export, scoring logic
- Radio assignment/control endpoints
- Routing override resolution (`ui/src/routing.ts`)
- Remote provisioning (`src/remote-provision.ts`)

For high-risk changes, include a short risk note in summaries.

## Implementation rules

- Keep existing route/API contracts unless explicit migration is requested.
- Preserve compatibility aliases where currently supported.
- Avoid broad refactors while fixing targeted bugs.
- Never emit credentials/secrets in logs.

## Verification requirements

- UI touched: run `npm -C ui run build`
- API/shared TS touched: run `npm run build`
- If relevant tests exist, run focused tests for changed behavior.

## Documentation expectations

If behavior changes, update docs or PR notes to match:

- user-facing behavior
- operational/deployment implications
- fallback or migration details
