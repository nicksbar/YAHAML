# Contest Management System

## Overview

YAHAML includes a comprehensive contest management system with support for multiple contest types including ARRL Field Day, Winter Field Day, POTA (Parks on the Air), and SOTA (Summits on the Air). The system is designed to be extensible, allowing you to add custom contest types while maintaining standardized scoring and logging.

## Architecture

### Contest Templates

Contest templates define the rules, scoring, and configuration for different contest types. Each template includes:

- **Scoring Rules**: Points per QSO, mode multipliers, bonuses
- **Required Fields**: Class, section, power, location, exchange formats
- **Validation Rules**: Allowed bands, modes, duplicate handling
- **UI Configuration**: Form layouts, dashboard widgets, colors

### Contest Instances

Contest instances are created from templates and represent an actual contest event. They inherit the template's rules but can be customized with:

- **Timing**: Start and end times
- **Configuration**: Contest-specific settings
- **State**: Live QSO counts, points, statistics

## Supported Contest Types

### 1. ARRL Field Day

**Type:** `ARRL_FD`  
**Organization:** ARRL  
**Icon:** 🎯

#### Scoring
- **CW/Digital**: 2 points per QSO
- **Phone**: 1 point per QSO
- **Multipliers**: ARRL/RAC sections worked
- **Power Multiplier**:
  - HIGH (>150W): 1x
  - LOW (≤150W): 2x
  - QRP (≤5W): 5x

#### Bonuses (100 points each unless noted)
- ✅ 100% Emergency Power
- 📰 Media Publicity
- 🏛️ Set up in Public Place
- ℹ️ Information Booth
- 📨 NTS Message to SM/SEC (10 points)
- 📻 W1AW Field Day Message
- 🛰️ Satellite QSO
- 🏛️ Site Visited by Elected Official
- 📋 Site Visited by ARRL Official
- 🎯 GOTA Bonus (20 points per QSO, max 400)
- 👦 Youth Participation (20 points per youth, max 400)
- 🏠 Home Station (Class D/E with emergency power)

#### Classes
- **A (Field)**: 1A-6A (transmitters + portable)
- **B**: 1B (Home with battery/generator)
- **C**: 1C (Mobile)
- **D**: 1D (Home)
- **E**: 1E-3E (Home emergency)
- **F**: 1F-3F (Emergency Operations Center)

#### Required Fields
- Class (e.g., 2A, 3A)
- ARRL Section (e.g., ORG, ENY)
- Power level (HIGH, LOW, QRP)
- Number of participants

#### Exchange
- **Send**: Class + Section
- **Receive**: Class + Section

### 2. Winter Field Day

**Type:** `WINTER_FD`  
**Organization:** Winter Field Day Association  
**Icon:** ❄️

#### Scoring
- **CW/Digital**: 2 points per QSO
- **Phone**: 1 point per QSO
- **Multipliers**: ARRL/RAC sections worked
- **Power Multiplier**: Same as ARRL FD (HIGH=1x, LOW=2x, QRP=5x)

#### Bonuses
- ✅ 100% Emergency Power (100 points)
- 🌨️ Outdoor Setup (50 points)
- ℹ️ Information Booth (100 points)
- 👦 Youth Participation (20 points each, max 400)
- 📱 Social Media (100 points)

#### Classes
- **O (Outdoor)**: 1O, 2O, 3O
- **I (Indoor)**: 1I, 2I, 3I
- **H (Home)**: 1H

#### Required Fields
- Class (e.g., 2O, 1I)
- Maidenhead grid square
- Power level (HIGH, LOW, QRP)

#### Exchange
- **Send**: Class + Section (optional)
- **Receive**: Class + Section (optional)

### 3. POTA (Parks on the Air)

**Type:** `POTA`  
**Organization:** Parks on the Air  
**Icon:** 🏞️

#### Scoring
- **Activator**: 1 point per QSO (10 QSO minimum for valid activation)
- **Hunter**: 1 point per park worked
- **Park-to-Park**: +1 bonus point

#### Required Fields
- Park reference (e.g., K-4566 for Acadia National Park)
- Operating location grid square

#### Exchange
- **Send**: RST + Park Reference
- **Receive**: RST + Park Reference (if P2P)

#### Park References
Format: `[Country]-[Number]`
- K-#### (US National Parks)
- US-#### (US State Parks)
- VE-#### (Canadian Parks)
- etc.

#### Validation
- Valid activation requires 10+ QSOs
- Park reference must match POTA database format

### 4. SOTA (Summits on the Air)

**Type:** `SOTA`  
**Organization:** Summits on the Air  
**Icon:** ⛰️

#### Scoring
- **Activator**: Points based on summit altitude
- **Chaser**: Points per summit worked
- **Summit-to-Summit**: 2× bonus points

#### Required Fields
- Summit reference (e.g., W7W/LC-001)
- Operating location grid square (optional)

#### Exchange
- **Send**: RST + Summit Reference
- **Receive**: RST + Summit Reference (if S2S)

#### Summit References
Format: `[Association]/[Region]-[Number]`
- W7W/LC-001 (Washington State)
- W6/CT-### (California)
- VE3/ON-### (Ontario)
- etc.

#### Validation
- Valid activation requires 4+ QSOs
- Summit reference must match SOTA database format

## API Endpoints

### Contest Templates

#### GET `/api/contest-templates`
List all public, active contest templates.

**Response:**
```json
[
  {
    "id": "...",
    "type": "ARRL_FD",
    "name": "ARRL Field Day",
    "description": "...",
    "organization": "ARRL",
    "scoringRules": "{ ... }",
    "requiredFields": "{ ... }",
    "validationRules": "{ ... }",
    "uiConfig": "{ ... }",
    "isActive": true,
    "isPublic": true
  }
]
```

#### GET `/api/contest-templates/:id`
Get template by ID.

#### GET `/api/contest-templates/by-type/:type`
Get template by type (e.g., `ARRL_FD`, `POTA`).

### Contest Instances

#### POST `/api/contests/from-template`
Create a new contest from a template.

**Request:**
```json
{
  "templateId": "...",
  "name": "Field Day 2026",
  "startTime": "2026-06-27T18:00:00Z",
  "endTime": "2026-06-28T20:59:00Z",
  "config": {
    "class": "3A",
    "section": "ORG",
    "power": "LOW"
  }
}
```

**Response:**
```json
{
  "id": "...",
  "name": "Field Day 2026",
  "templateId": "...",
  "isActive": true,
  "startTime": "2026-06-27T18:00:00Z",
  "endTime": "2026-06-28T20:59:00Z",
  "config": "{ ... }",
  "template": { ... }
}
```

#### GET `/api/contests/active/current`
Get the currently active contest (includes template).

## Creating Custom Contest Types

### 1. Define the Template

Create a new template in `src/contest-templates.ts`:

```typescript
export const MY_CONTEST: ContestTemplate = {
  type: 'MY_CONTEST',
  name: 'My Custom Contest',
  description: 'Description of the contest',
  organization: 'Contest Sponsor',
  scoringRules: {
    pointsPerQso: 1,
    pointsByMode: {
      CW: 2,
      PHONE: 1,
    },
    multipliers: [
      {
        type: 'state',
        perBand: true,
        description: 'States per band',
      },
    ],
    bonuses: [],
    formula: 'QSOs × Points + Multipliers',
  },
  requiredFields: {
    state: {
      required: true,
      description: 'Your state/province',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10'],
    modes: ['CW', 'SSB', 'DIGITAL'],
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['rst', 'state'],
      received: ['rst', 'state'],
    },
  },
  uiConfig: {
    primaryColor: '#4CAF50',
    icon: '🎪',
    logForm: {
      fields: ['callsign', 'band', 'mode', 'rst-sent', 'rst-rcvd', 'state'],
    },
    dashboard: {
      widgets: ['qso-count', 'multipliers', 'score'],
      stats: ['totalQsos', 'totalPoints', 'statesWorked'],
    },
    helpUrl: 'https://example.com/rules',
  },
  isActive: true,
  isPublic: true,
};
```

### 2. Add to Template List

```typescript
export const CONTEST_TEMPLATES: ContestTemplate[] = [
  ARRL_FIELD_DAY,
  WINTER_FIELD_DAY,
  POTA,
  SOTA,
  MY_CONTEST, // Add your template
];
```

### 3. Seed the Database

```bash
npx ts-node src/seed-templates.ts
```

### 4. Implement Scoring Logic

For custom scoring rules, extend the scoring engine in `src/scoring.ts` (to be created):

```typescript
export function calculateScore(contest: Contest, qsos: QSOLog[]): number {
  const template = contest.template;
  const rules = JSON.parse(template.scoringRules);
  
  // Implement custom scoring logic here
  let points = 0;
  
  for (const qso of qsos) {
    // Apply mode multipliers
    const modePoints = rules.pointsByMode?.[qso.mode] || rules.pointsPerQso;
    points += modePoints;
  }
  
  // Calculate multipliers
  const multipliers = calculateMultipliers(qsos, rules.multipliers);
  
  return points * multipliers;
}
```

## Database Schema

### ContestTemplate
```prisma
model ContestTemplate {
  id              String   @id @default(cuid())
  type            String   @unique
  name            String
  description     String?
  organization    String?
  scoringRules    String   // JSON
  requiredFields  String   // JSON
  validationRules String   // JSON
  uiConfig        String?  // JSON
  isActive        Boolean  @default(true)
  isPublic        Boolean  @default(true)
  contests        Contest[]
}
```

### Contest
```prisma
model Contest {
  id          String   @id @default(cuid())
  name        String
  isActive    Boolean  @default(false)
  templateId  String?
  template    ContestTemplate?
  config      String?  // JSON
  startTime   DateTime?
  endTime     DateTime?
  totalQsos   Int      @default(0)
  totalPoints Int      @default(0)
  statistics  String?  // JSON
  clubs       Club[]
}
```

## UI Components

### Contest Selection

The Contests view displays all available contest templates with:
- Template icon and name
- Organization
- Description
- Scoring summary
- Available bonuses count
- Class options
- "Create Contest" button
- Link to official rules

### Contest Creation

When creating a contest from a template:
1. Select template
2. Contest is created with current year appended to name
3. Contest becomes active (previous contests are deactivated)
4. Template rules and configuration are inherited

### Active Contest Display

The active contest panel shows:
- Contest name
- Mode/type
- Total QSOs
- Total points
- Time remaining (if configured)

## Best Practices

### 1. Contest Configuration
- Always set start and end times for time-limited contests
- Configure the class and section during contest creation
- Set power level to apply correct multipliers

### 2. QSO Logging
- Validate exchange fields match contest requirements
- Check for duplicates based on contest rules
- Log required fields (RST, exchange, etc.)

### 3. Scoring
- Points are calculated in real-time
- Bonuses are tracked separately
- Final score includes all multipliers and bonuses

### 4. Post-Contest
- Export logs in ADIF format
- Generate Cabrillo files for submission
- Review statistics and multipliers worked

## Future Enhancements

- [ ] Automatic bonus tracking and claiming
- [ ] Real-time leaderboards
- [ ] Multi-operator coordination
- [ ] Contest calendar integration
- [ ] Automatic log submission
- [ ] Advanced statistics and analysis
- [ ] Mobile app for field operations
- [ ] Integration with external contest APIs (e.g., POTA Spots, SOTA Alerts)

## Resources

- [ARRL Field Day Rules](http://www.arrl.org/field-day)
- [Winter Field Day Rules](https://winterfieldday.org)
- [POTA Website](https://parksontheair.com)
- [SOTA Website](https://www.sota.org.uk)
