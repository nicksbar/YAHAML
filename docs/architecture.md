# YAHAML Architecture

## System Overview

YAHAML is a multi-service ham radio logging system with:
- **web-ui** (Vite React): Browser interface for logging and station management
- **api** (Express.js): REST API for logging, stations, contests, clubs, and real-time updates
- **relay** (TCP): N3FJP protocol relay for band occupancy and rig control
- **websocket**: Real-time event streaming for live dashboard updates
- **database** (SQLite): Prisma ORM with contest templates and logging

## Services Architecture

## Core Data Models

### Station
Represents an operator/callsign with their configuration:
- Callsign (unique identifier)
- Operator name and license class
- Current operating location (via `locationId` FK)
- Club membership (optional)
- Deprecated fields: `section`, `grid` (use Location model instead)

### Location
Reusable named operating locations:
- Name (e.g., "Home QTH", "Field Day Site")
- Coordinates (latitude, longitude)
- Maidenhead grid square (auto-calculated)
- ARRL section, county
- CQ Zone (1-40), ITU Zone (1-90)
- Elevation in feet
- `isDefault` flag for quick selection

Multiple stations can reference the same location, or switch between saved locations.

### Contest
Active or scheduled contests with:
- Contest template (defines rules, exchanges, scoring)
- Start/end times
- Associated club (for club-coordinated events)
- Participant stations

### LogEntry (QSO)
Individual contacts with deduplication:
- Station callsign, remote callsign
- Band, mode, frequency
- Date/time, exchange data
- Contest and club associations
- Source tracking (UDP, manual, etc.)
- Deduplication key to prevent double-logging

### Club
Organizations coordinating multi-operator events:
- Member stations
- Special event callsigns
- Associated contests

## Data Flow
1. User logs a contact via web UI or UDP bridge
2. API validates against contest template rules (if applicable)
3. QSO stored with deduplication check
4. Real-time updates via WebSocket to all connected stations
5. Aggregation engine updates scoreboard and band occupancy
6. Export available in ADIF and Cabrillo formats

## Radio Control Flow
1. User interacts with radio controls in UI (frequency slider, mode dropdown, PTT button)
2. Frontend sends WebSocket message: `{ type: 'radioControl', data: { radioId, command, params } }`
3. Backend WebSocket handler validates and routes to RadioManager
4. RadioManager executes command via hamlib serialized command queue
5. Command result and fresh radio state fetched from rigctld
6. State update broadcast to all clients via WebSocket: `{ type: 'radioStateUpdate', ... }`
7. All connected clients update their UI with new radio state
8. Separate automatic polling (1000ms interval) ensures state stays fresh even without user commands

## API Endpoints

### Stations
- `GET /api/stations` - List all stations with locations
- `GET /api/stations/:id` - Get station details with location
- `POST /api/stations` - Create new station
- `PATCH /api/stations/:callsign` - Update station (name, class, locationId, clubId)

### Locations
- `GET /api/locations` - List all saved locations (defaults first)
- `GET /api/locations/:id` - Get specific location
- `POST /api/locations` - Create new location
- `PATCH /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Delete location
- `PATCH /api/locations/:id/set-default` - Set as default
- `GET /api/locations/zones?lat=X&lon=Y` - Lookup CQ/ITU zones from coordinates

### QSO Logging
- `GET /api/qso-logs/:stationId` - Get QSOs for station
- `POST /api/qso-logs` - Log new QSO with validation
- `GET /api/context-logs/:stationId` - Get raw UDP context logs

### Contests
- `GET /api/contests/active/current` - Get active contest
- `POST /api/contests` - Create new contest from template
- `PATCH /api/contests/:id/start` - Start contest
- `PATCH /api/contests/:id/stop` - Stop contest

### Export
- `GET /api/export/:stationId/adif` - Export ADIF file
- `GET /api/export/:stationId/cabrillo?contest=X` - Export Cabrillo

## Deployment
- Single binary deployment (Node.js + SQLite)
- Docker Compose with separate containers for UI, API, UDP bridge
- Shared SQLite database volume
- HAMLib rigctld as optional sidecar

## Observability
- Structured logging per service
- Health endpoint: `GET /health`
- Service status: `GET /api/services`
- Real-time activity via WebSocket

## Security
- Optional OAuth integration (GitHub, Google)
- Admin callsign list for contest management
- CORS enabled for local development
- No secrets in repository

## Integration Points
- **HamDB API**: Real-time callsign lookup for operator info
- **OpenStreetMap Nominatim**: Reverse geocoding for location details
- **UDP Protocol**: N3FJP-compatible logging protocol
- **HAMLib**: Remote rig control via rigctld TCP

