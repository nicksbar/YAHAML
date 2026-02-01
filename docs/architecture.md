# Architecture (Draft)

## Services
- **web-ui**: browser interface for logging and activity selection.
- **api**: core logging API (users, activities, log entries).
- **udp-bridge**: UDP receiver + broadcaster for interop.
- **rig-control**: HAMLib rigctl integration.
- **db**: persistent storage.

## Data Flow
1. User logs a contact in web UI.
2. API writes entry to db.
3. UDP bridge broadcasts log event.
4. Rig control service optionally provides freq/mode.

## Deployment
- Docker Compose with shared network and volumes.
- Each service independently scalable.

## Observability (MVP)
- Structured logs per service.
- Basic health endpoints.

## Security (MVP)
- Simple auth for UI and API.
- No secrets committed to repo.
