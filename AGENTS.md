# AGENTS.md — YAHAML Agent Operating Guide

This file defines how coding agents should work in this repository.

## Mission

Preserve YAHAML’s core spirit:

- **Reliable multi-operator logging first**
- **Contest correctness over cleverness**
- **Operational pragmatism** (field use, flaky links, mixed station hardware)
- **Interoperability** (N3FJP workflows, Hamlib/rigctld, Janus/WebRTC)

When in doubt, choose boring, observable, and reversible changes.

## Product Context (quick)

YAHAML is a collaborative ham radio logger with:

- React/Vite UI in `ui/`
- Express/TypeScript API in `src/`
- Prisma data layer in `prisma/`
- Real-time behavior via WebSocket channels
- Rig control via Hamlib (`rigctld`)
- Audio/voice paths via Janus/WebRTC and publisher tooling
- N3FJP-compatible relay/forwarding paths

Read first for deeper context:

- `README.md`
- `docs/architecture.md`
- `docs/provisioning.md`
- `docs/testing.md`
- `docs/protocol-summary.md`

## Golden Rules for Agents

1. **Do not break live operations workflows**
   - Logging, contest state, and radio assignment paths are high-sensitivity.
2. **Preserve backward compatibility where practical**
   - Keep legacy input paths/aliases unless explicitly removing.
3. **Validate before claiming done**
   - Run targeted checks, then project build when feasible.
4. **Prefer minimal patches**
   - Avoid broad refactors unless explicitly requested.
5. **Be explicit about risk**
   - Note migration, config, and behavior changes in summaries/PRs.

## Required Workflow for Code Changes

1. Locate relevant code paths and related call sites.
2. Make smallest viable change.
3. Run validation:
   - UI changes: `npm -C ui run build`
   - API/shared TS changes: `npm run build`
4. If tests exist for touched area, run focused tests.
5. Summarize exactly what changed and why.

## Domain-Specific Guardrails

### Logging and Contest Logic

- Treat dedupe/merge and scoring as correctness-critical.
- Never silently change scoring semantics without explicit request.

### Radio Control (Hamlib)

- Keep operator feedback clear (state, errors, connection source).
- Avoid introducing polling storms; respect existing update cadence.

### Provisioning and Remote Ops

- Assume containerized deployment may lack system binaries.
- Prefer graceful fallbacks over hard failures.
- Never log secrets.

### Routing / Host Overrides

- Preserve explicit host+port values when provided.
- Do not fabricate malformed URLs from partial overrides.

## Config and Security Expectations

- Don’t commit secrets or credentials.
- Treat passwords/tokens as write-only values.
- Use secure defaults and avoid increasing privilege scope.

## PR Quality Bar

A good PR in this repo includes:

- Clear user-visible behavior change summary
- Validation evidence (build/tests run)
- Notes on compatibility and deployment impact (if any)

## Branching Guidance

Use feature/bugfix branches for non-trivial work; avoid direct commits to `main`.
