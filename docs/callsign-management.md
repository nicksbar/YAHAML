# Club & Callsign Management

## Overview

YAHAML provides comprehensive club management with support for multiple callsigns, special event callsigns with time-based availability, and flexible enable/disable controls. This system is designed for Field Day operations, contests, and multi-operator coordination.

## Features

### 1. Club Management

Clubs are the organizational unit for multi-operator operations. Each club can have:

- **Primary Callsign**: Main club identifier (e.g., W1AW)
- **Alternative Callsigns**: Additional callsigns the club may use
- **Special Event Callsigns**: Time-limited callsigns for specific events
- **Enable/Disable Toggle**: Soft-delete clubs without losing historical data
- **Protected Delete**: Clubs with QSO logs cannot be deleted, only disabled

#### Creating a Club

1. Navigate to **Club & Event** tab
2. Fill in the "Add New Club" form:
   - **Club Callsign** * (required)
   - **Club Name** * (required)
   - **ARRL Section** (optional)
   - **Grid Square** (optional)
3. Click "💾 Save Club"
4. Form clears automatically on success

#### Managing Existing Clubs

Each club card displays:
- Callsign, name, section, and grid
- Alternative callsigns (if any)
- Station count and QSO count
- DISABLED badge (if inactive)

**Actions:**
- **Enable/Disable**: Toggle club active status
  - Active clubs show normally
  - Disabled clubs are dimmed with dashed border
- **Delete**: Only available for clubs with no QSO logs
  - Click "🗑 Delete" → inline confirmation "Sure? Yes/No"
  - Clubs with logs show only Enable/Disable button

### 2. Alternative Club Callsigns

Clubs can register multiple callsigns that they may use during operations:

- **Primary Callsign**: The main club callsign (e.g., W1AW)
- **Alternative Callsigns**: Additional callsigns the club may use (e.g., N1ABC, K1XYZ)

#### How to Add Alternative Callsigns

1. Navigate to **Club & Event** tab
2. When creating a club, use the "Alternative Club Callsigns" field
3. Enter callsigns separated by commas: `N1ABC, W1XYZ, K1DEF`
4. Saved as JSON array in the database

### 3. Special Event Callsigns

Special event callsigns allow you to schedule temporary callsigns for specific events with defined start and end dates.

#### Features

- **Time-Based Activation**: Automatically determine if a callsign is active based on current date/time
- **Event Association**: Link special callsigns to specific clubs
- **Status Tracking**: View ACTIVE, PENDING, or EXPIRED status
- **Usage Tracking**: Track how many times a special callsign has been used
- **Inline Delete**: Click Delete → "Sure? Yes/No" confirmation appears inline

#### How to Add a Special Event Callsign

1. Navigate to **Club & Event** tab
2. Scroll to "Special Event Callsigns" section
3. Fill in the form:
   - **Callsign** * (required)
   - **Event Name** * (required)
   - **Start Date/Time** * (required)
   - **End Date/Time** * (required)
   - **Description** (optional)
   - **Associated Club** (optional dropdown)
4. Click "💾 Save Special Callsign"
5. Form clears automatically on success

#### Status Indicators

- **ACTIVE** (accent badge): The special callsign is currently valid and can be used
- **PENDING** (gray badge): The special callsign is scheduled but not yet valid
- **EXPIRED** (gray): The special callsign's validity period has ended

## API Endpoints

### Special Callsigns

- `GET /api/special-callsigns` - List all special callsigns
- `GET /api/special-callsigns/active` - List only currently active special callsigns
- `POST /api/special-callsigns` - Create a new special callsign
- `PATCH /api/special-callsigns/:id` - Update a special callsign
- `DELETE /api/special-callsigns/:id` - Delete a special callsign

### Clubs

- `GET /api/clubs` - List all clubs
- `POST /api/clubs` - Create a new club
- `PATCH /api/clubs/:id` - Update a club

## Database Schema

### SpecialCallsign Model

```prisma
model SpecialCallsign {
  id             String   @id @default(cuid())
  callsign       String   @unique
  eventName      String
  description    String?
  startDate      DateTime
  endDate        DateTime
  clubId         String?
  club           Club?    @relation(fields: [clubId], references: [id])
  isActive       Boolean  @default(true)
  autoActivate   Boolean  @default(true)
  usageCount     Int      @default(0)
  lastUsed       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

## Use Cases

### Field Day Operations

1. Create a club with primary callsign `W1ABC`
2. Add alternative callsigns: `W1ABC/1, W1ABC/2, W1ABC/3`
3. Create special event callsign for Field Day weekend:
   - Callsign: `W1AW/FD`
   - Start: June 28, 2026 2:00 PM
   - End: June 29, 2026 2:00 PM
   - Associated Club: W1ABC

### Centennial/Anniversary Operations

1. Create special event callsign for club centennial:
   - Callsign: `W1ABC/100`
   - Start: January 1, 2026
   - End: December 31, 2026
   - Description: "Club 100th Anniversary"

### Multi-Station Events

Use alternative callsigns to track different operating positions:
- Main club: `W1ABC`
- Alternatives: `W1ABC/QRP`, `W1ABC/6`, `W1ABC/VHF`

## Future Enhancements

- Auto-activation based on date ranges (currently manual)
- Integration with logging to show available callsigns
- QSL card generation with special event information
- Statistics tracking per special callsign
- Certificate/award tracking for special event participants
