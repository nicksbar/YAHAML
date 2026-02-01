# YAHAML - Node.js Relay Server & Database

## Architecture Complete ✅

### 1. **ORM & Database** (Prisma SQLite)
- ✅ 6 data models with relationships
- ✅ Stations, Band Activities, QSO Logs, Context Logs, Network Status
- ✅ ADIF-compatible schema
- ✅ Database seeding with sample data

### 2. **Relay Server** (N3FJP Protocol)
- ✅ TCP relay on port 10000
- ✅ UTF-16LE encoding with BOR/EOR framing
- ✅ Silent relay architecture (broadcasts all messages to all clients)
- ✅ BAMS message parsing (station, band, mode)
- ✅ Full database logging of:
  - Band changes → BandActivity table
  - Connection events → ContextLog table
  - Network status → NetworkStatus table
  - Station creation on first message

### 3. **REST API** (Express.js)
- ✅ Health check endpoint
- ✅ Station CRUD operations
- ✅ Band activity logging
- ✅ QSO log management
- ✅ Context log viewing
- ✅ Station details with relationships

### 4. **Testing Suite** (Jest + TypeScript)

#### Unit Tests (relay.test.ts)
- Message encoding/decoding
- BAMS parsing
- Station management
- Band activity logging
- Network status tracking

#### API Integration Tests (api.test.ts)
- Health endpoint
- Station CRUD
- Relationships
- Error handling

#### E2E Tests (relay.e2e.test.ts)
- Live client connections
- Station creation via relay
- Band activity logging via relay
- Database verification

**Run tests:**
```bash
npm test                          # All tests
npm test:watch                    # Watch mode
npm test:coverage                 # Coverage report
npm test -- --testPathPattern="relay.test|api.test"  # Skip E2E
```

## Project Structure

```
├── src/
│   ├── index.ts          # Main server (API + Relay)
│   ├── db.ts             # Prisma client
│   └── relay.ts          # Relay server implementation
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Sample data
├── tests/
│   ├── setup.ts          # Test utilities
│   ├── relay.test.ts     # Unit tests
│   ├── api.test.ts       # API integration tests
│   └── relay.e2e.test.ts # E2E tests
├── jest.config.ts        # Jest configuration
├── tsconfig.json         # TypeScript config
└── package.json          # Dependencies and scripts
```

## Database Schema

### Stations
- `id`, `callsign` (unique), `name`, `class`, `section`, `grid`
- Relations: bandActivities, qsoLogs, contextLogs, networkStatus

### BandActivity
- Track current band/mode for each station
- Indexed on stationId and lastSeen

### QSOLog
- Individual QSO records
- ADIF-compatible fields: callsign, band, mode, frequency, RST, power
- Points calculation support

### ContextLog
- Event logging: band changes, QSOs, network events
- Levels: INFO, WARN, ERROR, SUCCESS
- Categories: BAND_CHANGE, QSO_LOGGED, NETWORK, EQUIPMENT, NOTE

### NetworkStatus
- Connection state and relay info
- IP, port, relay host/version tracking

## Running the Application

### Development
```bash
npm install
npm run db:push          # Create database schema
npm run db:seed          # Seed sample data
npm run dev              # Start API + Relay server
```

### Testing
```bash
npm test                 # Run all tests
npm test:watch          # Watch mode
npm test:coverage       # Coverage report
```

### Database Management
```bash
npm run db:studio       # Open Prisma Studio (visual DB editor)
npm run db:push         # Sync schema
npm run db:seed         # Reseed data
```

### Production Build
```bash
npm run build
npm start
```

## API Endpoints

### Stations
- `GET /api/stations` - List all stations
- `GET /api/stations/:id` - Get station with details
- `POST /api/stations` - Create new station

### Band Activity
- `POST /api/band-activity` - Log band change

### QSO Logs
- `GET /api/qso-logs/:stationId` - Get QSOs for station
- `POST /api/qso-logs` - Create QSO log

### Context Logs
- `GET /api/context-logs/:stationId` - Get events
- `POST /api/context-logs` - Create context log

## Technical Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Server**: Express.js
- **Testing**: Jest + Supertest
- **Network**: Node.js TCP sockets
- **Encoding**: UTF-16LE (N3FJP protocol)

## Next Steps

1. ✅ **ORM Setup** - COMPLETE
2. ✅ **Relay Server** - COMPLETE
3. ✅ **REST API** - COMPLETE
4. ✅ **Testing Suite** - COMPLETE
5. **WebSocket Real-time** - Add Socket.IO for live updates
6. **ADIF Import/Export** - Parse and export ADIF files
7. **React UI** - Build dashboard
8. **Docker** - Containerize application
9. **Authentication** - Add user management

## Database Logging Features

Every relay server action is tracked:

1. **Band Changes**: Logged to BandActivity table
   - Station callsign → auto-lookup or create
   - Band and mode extracted from BAMS message
   - Timestamp on creation

2. **Context Events**: Logged to ContextLog table
   - Connection events (NETWORK category)
   - Band changes (BAND_CHANGE category)
   - QSO logging (QSO_LOGGED category)
   - System events (EVENT category)

3. **Network Status**: Tracked in NetworkStatus table
   - Connection state (isConnected boolean)
   - IP address and ports
   - Last connection timestamp
   - Relay server version

This provides complete audit trail and operational visibility.
