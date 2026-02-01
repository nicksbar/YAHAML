# Requirements

## MVP Scope
### Functional
- Multi-user logging with callsign identity.
- Activity context: Field Day, POTA, SOTA, contest, custom.
- Log entry CRUD (create, read, update, delete) with shared activity scope.
- UDP receiver to ingest log events from external apps.
- UDP broadcaster to publish log events for external apps.
- Rig control integration (HAMLib rigctl) for freq/mode capture.

### Non-Functional
- Containerized deployment with Docker Compose.
- Portable across Linux hosts.
- Explicit test coverage for core logging and UDP interop.
- Clear separation of services for maintainability.

## Out of Scope (Initial)
- Full parity with N1MM/DXLab/N3FJP features.
- Complex scoring rules beyond initial contest templates.
- Proprietary protocol dependencies.

## Personas
- **Club Operator:** multiple users logging shared activity.
- **Solo Operator:** wants a clean UI and UDP interoperability.
- **Tech Lead:** wants predictable deployment and extensibility.

## Acceptance Criteria (Examples)
- When two users log in with different callsigns, both can see new log entries in the shared activity within 2 seconds.
- UDP log messages received are mapped into internal log entries with no data loss for required fields.
- UDP broadcasts can be consumed by at least one common logging tool in a round-trip test.

## Open Questions
- Which UDP formats are required for MVP?
- What are required fields for log entries (ADIF baseline)?
- Which storage backend for MVP?
