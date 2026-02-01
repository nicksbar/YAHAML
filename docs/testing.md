# Testing Strategy

## Goals
- Ensure logging correctness and UDP interoperability.
- Maintain confidence in multi-user scenarios.

## Test Levels
- **Unit:** log entry validation, parsing, mapping.
- **Integration:** API + db, UDP ingest, UDP broadcast.
- **Contract:** UDP message formats (fixtures and golden files).
- **E2E:** multi-user flows with shared activity.

## Test Data
- Use anonymized callsigns and synthetic logs.
- Maintain fixture packs per UDP format.

## Testability Requirements
- All UDP parsing/broadcast logic must be pure and testable.
- Services expose health endpoints for integration tests.

## CI Hooks (Future)
- Lint, unit, integration, and smoke tests.
