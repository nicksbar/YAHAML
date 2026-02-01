import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Prisma } from '@prisma/client';
import prisma from './db';
import { startRelayServer } from './relay';
import { parseUdpTargets, startUdpServer } from './udp';
import { radioManager } from './hamlib';
import {
  generateAdifContent,
  generateCabrilloContent,
  validateCabrilloQso,
} from './export';
import { wsManager } from './websocket';
import {
  updateAggregates,
  getAggregates,
  getScoreboard,
  getBandOccupancy,
  getOperatorActivity,
} from './aggregation';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const relayPort = process.env.RELAY_PORT || 10000;
const relayHost = process.env.RELAY_HOST || '0.0.0.0';
const udpPort = process.env.UDP_PORT || 2237;
const udpHost = process.env.UDP_HOST || '0.0.0.0';
const udpTargets = parseUdpTargets(process.env.UDP_TARGETS);
const oauthEnabled = process.env.OAUTH_ENABLED === 'true';

function buildDedupeKey(input: {
  stationCall: string;
  callsign: string;
  band: string;
  mode: string;
  qsoDate: Date;
  qsoTime: string;
  contestId?: string | null;
  clubId?: string | null;
}): string {
  const dateStr = input.qsoDate.toISOString().slice(0, 10);
  return [
    input.contestId || 'none',
    input.clubId || 'none',
    input.stationCall.toUpperCase(),
    input.callsign.toUpperCase(),
    input.band.toUpperCase(),
    input.mode.toUpperCase(),
    dateStr,
    input.qsoTime,
  ].join('|');
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Services status endpoint
app.get('/api/services', (req, res) => {
  // Get the actual host from the request or use configured host
  const requestHost = req.get('host') || `${host}:${port}`;
  const protocol = req.protocol || 'http';
  
  res.json({
    api: {
      name: 'REST API',
      port: Number(port),
      host,
      status: 'running',
      url: `${protocol}://${requestHost}`,
    },
    relay: {
      name: 'N3FJP Relay Server',
      port: Number(relayPort),
      host: relayHost,
      status: 'running',
      protocol: 'TCP',
      encoding: 'UTF-16LE',
      url: `${relayHost === '0.0.0.0' ? req.hostname : relayHost}:${relayPort}`,
    },
    udp: {
      name: 'UDP Log Listener',
      port: Number(udpPort),
      host: udpHost,
      status: 'running',
      protocol: 'UDP',
      url: `${udpHost === '0.0.0.0' ? req.hostname : udpHost}:${udpPort}`,
    },
  });
});

// OAuth stubs (configure external auth later)
app.get('/auth/github', (_req, res) => {
  if (!oauthEnabled) {
    return res.status(501).json({ error: 'OAuth not configured' });
  }
  return res.status(501).json({ error: 'OAuth flow not implemented yet' });
});

app.get('/auth/google', (_req, res) => {
  if (!oauthEnabled) {
    return res.status(501).json({ error: 'OAuth not configured' });
  }
  return res.status(501).json({ error: 'OAuth flow not implemented yet' });
});

// Stations endpoints
app.get('/api/stations', async (_req, res) => {
  try {
    const stations = await prisma.station.findMany({
      include: {
        bandActivities: true,
        networkStatus: true,
        _count: {
          select: { qsoLogs: true, contextLogs: true },
        },
      },
    });
    return res.json(stations);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

app.get('/api/stations/:id', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { id: req.params.id },
      include: {
        bandActivities: true,
        qsoLogs: { orderBy: { qsoDate: 'desc' }, take: 10 },
        contextLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        networkStatus: true,
      },
    });
    return res.json(station);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch station' });
  }
});

app.post('/api/stations', async (req, res) => {
  try {
    const { callsign, name, class: stationClass, section, grid } = req.body;
    const station = await prisma.station.create({
      data: {
        callsign,
        name,
        class: stationClass,
        section,
        grid,
      },
    });
    return res.status(201).json(station);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create station' });
  }
});

app.post('/api/band-activity', async (req, res) => {
  try {
    const { stationId, band, mode, frequency, power } = req.body;
    const activity = await prisma.bandActivity.create({
      data: {
        stationId,
        band,
        mode,
        frequency,
        power,
      },
    });
    return res.status(201).json(activity);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create band activity' });
  }
});

// QSO log endpoints
app.get('/api/qso-logs/:stationId', async (req, res) => {
  try {
    const logs = await prisma.logEntry.findMany({
      where: { stationId: req.params.stationId },
      orderBy: { qsoDate: 'desc' },
    });
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch QSO logs' });
  }
});

app.post('/api/qso-logs', async (req, res) => {
  try {
    const {
      stationId,
      callsign,
      band,
      mode,
      qsoDate,
      qsoTime,
      contestId,
      clubId,
      operatorCallsign,
      source,
      dedupeKey,
      ...rest
    } = req.body;

    if (!stationId || !callsign || !band || !mode || !qsoDate || !qsoTime) {
      return res.status(400).json({ error: 'Missing required QSO fields' });
    }

    const station = await prisma.station.findUnique({
      where: { id: stationId },
    });

    const resolvedDedupeKey = dedupeKey || buildDedupeKey({
      stationCall: station?.callsign || stationId,
      callsign,
      band,
      mode,
      qsoDate: new Date(qsoDate),
      qsoTime,
      contestId,
      clubId,
    });

    try {
      const qsoLog = await prisma.logEntry.create({
        data: {
          stationId,
          callsign,
          band,
          mode,
          qsoDate: new Date(qsoDate),
          qsoTime,
          contestId,
          clubId,
          operatorCallsign,
          source: source || 'api',
          dedupeKey: resolvedDedupeKey,
          ...rest,
        },
      });

      // Update aggregates and check for duplicates (async, don't block response)
      if (contestId) {
        updateAggregates(qsoLog).then(async (aggregate) => {
          // Broadcast to WebSocket clients
          wsManager.broadcast(`contest:${contestId}`, 'logEntry:created', qsoLog);
          wsManager.broadcast(`contest:${contestId}`, 'aggregate:updated', aggregate);

          // Check for duplicates and broadcast alert
          const existingEntry = await prisma.logEntry.findFirst({
            where: {
              stationId,
              callsign,
              band,
              mode,
              merge_status: { not: 'duplicate_of' },
              id: { not: qsoLog.id },
            },
          });

          if (existingEntry && contestId) {
            wsManager.broadcast(`contest:${contestId}`, 'dupe:detected', {
              entry: qsoLog,
              duplicate: existingEntry,
            });
          }
        }).catch((error) => {
          console.error('Failed to update aggregates:', error);
        });
      }

      return res.status(201).json(qsoLog);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(200).json({ deduped: true, dedupeKey: resolvedDedupeKey });
      }
      throw error;
    }
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create QSO log' });
  }
});

// Merge QSO log entries (mark duplicates as merged into primary)
app.post('/api/logs/merge', async (req, res) => {
  try {
    const { primary_id, duplicate_ids, merge_reason } = req.body;

    // Validation
    if (!primary_id) {
      return res.status(400).json({ error: 'primary_id is required' });
    }

    if (!duplicate_ids || !Array.isArray(duplicate_ids) || duplicate_ids.length === 0) {
      return res.status(400).json({ error: 'duplicate_ids must be a non-empty array' });
    }

    // Ensure primary_id is not in duplicate_ids
    if (duplicate_ids.includes(primary_id)) {
      return res.status(400).json({ error: 'Primary ID cannot be in duplicate list' });
    }

    // Verify primary entry exists
    const primary = await prisma.logEntry.findUnique({
      where: { id: primary_id },
    });

    if (!primary) {
      return res.status(404).json({ error: 'Primary entry not found' });
    }

    // Verify all duplicates exist
    const duplicates = await prisma.logEntry.findMany({
      where: { id: { in: duplicate_ids } },
    });

    if (duplicates.length !== duplicate_ids.length) {
      return res.status(404).json({ error: 'One or more duplicate entries not found' });
    }

    // Atomic merge transaction
    const result = await prisma.$transaction(
      duplicate_ids.map(dup_id =>
        prisma.logEntry.update({
          where: { id: dup_id },
          data: {
            merge_status: 'duplicate_of',
            merged_into_id: primary_id,
            merge_reason: merge_reason || 'merged via API',
            merge_timestamp: new Date(),
          },
        })
      )
    );

    return res.status(200).json({
      success: true,
      primary_id,
      merged_count: result.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Merge error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to merge entries', details: errorMessage });
  }
});

// Query merged entries for a primary QSO
app.get('/api/logs/:id/merged-with', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the primary entry
    const primary = await prisma.logEntry.findUnique({
      where: { id },
    });

    if (!primary) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Get all entries merged into this one
    const merged = await prisma.logEntry.findMany({
      where: {
        merged_into_id: id,
        merge_status: 'duplicate_of',
      },
      orderBy: { merge_timestamp: 'desc' },
    });

    return res.json({
      primary_id: id,
      primary_entry: {
        callsign: primary.callsign,
        band: primary.band,
        mode: primary.mode,
        qsoDate: primary.qsoDate,
        source: primary.source,
      },
      merged_from: merged.map(m => ({
        id: m.id,
        callsign: m.callsign,
        source: m.source,
        merge_reason: m.merge_reason,
        merge_timestamp: m.merge_timestamp,
      })),
      merged_count: merged.length,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch merge history' });
  }
});

// ============================================================================
// AGGREGATE STATISTICS ENDPOINTS
// ============================================================================

// Get time-series aggregates for a contest
app.get('/api/stats/aggregates', async (req, res) => {
  try {
    const { contestId, start, end } = req.query;

    if (!contestId) {
      return res.status(400).json({ error: 'contestId is required' });
    }

    const startDate = start ? new Date(String(start)) : undefined;
    const endDate = end ? new Date(String(end)) : undefined;

    const aggregates = await getAggregates(
      String(contestId),
      startDate,
      endDate
    );

    return res.json(aggregates);
  } catch (error) {
    console.error('Failed to fetch aggregates:', error);
    return res.status(500).json({ error: 'Failed to fetch aggregates' });
  }
});

// Get scoreboard (operator rankings) for a contest
app.get('/api/stats/scoreboard', async (req, res) => {
  try {
    const { contestId } = req.query;

    if (!contestId) {
      return res.status(400).json({ error: 'contestId is required' });
    }

    const scoreboard = await getScoreboard(String(contestId));

    return res.json(scoreboard);
  } catch (error) {
    console.error('Failed to fetch scoreboard:', error);
    return res.status(500).json({ error: 'Failed to fetch scoreboard' });
  }
});

// Get band occupancy (last hour activity) for a contest
app.get('/api/stats/band-occupancy', async (req, res) => {
  try {
    const { contestId } = req.query;

    if (!contestId) {
      return res.status(400).json({ error: 'contestId is required' });
    }

    const occupancy = await getBandOccupancy(String(contestId));

    return res.json(occupancy);
  } catch (error) {
    console.error('Failed to fetch band occupancy:', error);
    return res.status(500).json({ error: 'Failed to fetch band occupancy' });
  }
});

// Get operator activity stats
app.get('/api/stats/operator-activity', async (req, res) => {
  try {
    const { contestId, operatorCall } = req.query;

    if (!contestId) {
      return res.status(400).json({ error: 'contestId is required' });
    }

    if (!operatorCall) {
      return res.status(400).json({ error: 'operatorCall is required' });
    }

    const activity = await getOperatorActivity(
      String(contestId),
      String(operatorCall)
    );

    return res.json(activity);
  } catch (error) {
    console.error('Failed to fetch operator activity:', error);
    return res.status(500).json({ error: 'Failed to fetch operator activity' });
  }
});

// Export endpoints
app.get('/api/export/adif', async (req, res): Promise<void> => {
  try {
    const { contestId, format = '3' } = req.query;

    if (!contestId) {
      res.status(400).json({ error: 'contestId is required' });
      return;
    }

    if (!['2', '3'].includes(String(format))) {
      res.status(400).json({ error: 'format must be "2" or "3"' });
      return;
    }

    // Fetch all primary (non-merged) entries
    const entries = await prisma.logEntry.findMany({
      where: {
        contestId: String(contestId),
        merge_status: { not: 'duplicate_of' },
      },
      orderBy: { qsoDate: 'asc' },
    });

    if (entries.length === 0) {
      res.status(404).json({ error: 'No QSO entries found for contest' });
      return;
    }

    // Generate ADIF content
    const adifContent = generateAdifContent(
      entries,
      String(format) as '2' | '3'
    );

    // Return as file download
    res.setHeader('Content-Type', 'application/x-adi');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="yahaml-${contestId}-${new Date().toISOString().slice(0, 10)}.adi"`
    );
    res.send(adifContent);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'ADIF export failed', details: message });
  }
});

app.get('/api/export/cabrillo', async (req, res): Promise<void> => {
  try {
    const { contestId, stationId, location } = req.query;

    if (!contestId) {
      res.status(400).json({ error: 'contestId is required' });
      return;
    }

    // Fetch contest details
    const contest = await prisma.contest.findUnique({
      where: { id: String(contestId) },
    });

    if (!contest) {
      res.status(404).json({ error: 'Contest not found' });
      return;
    }

    // Fetch primary entries
    const entries = await prisma.logEntry.findMany({
      where: {
        contestId: String(contestId),
        merge_status: { not: 'duplicate_of' },
      },
      orderBy: { qsoDate: 'asc' },
    });

    // Validate all entries
    const validationErrors: { [key: string]: string[] } = {};
    entries.forEach((entry, idx) => {
      const errors = validateCabrilloQso(entry);
      if (errors.length > 0) {
        validationErrors[`entry_${idx}`] = errors;
      }
    });

    if (Object.keys(validationErrors).length > 0) {
      res.status(400).json({
        error: 'Validation failed for one or more entries',
        details: validationErrors,
      });
      return;
    }

    // Get callsign from station
    let callsign = 'UNKNOWN';
    if (stationId) {
      const station = await prisma.station.findUnique({
        where: { id: String(stationId) },
      });
      if (station) {
        callsign = station.callsign;
      }
    }

    // Generate CABRILLO
    const cabrilloContent = generateCabrilloContent(
      entries,
      callsign,
      contest.name,
      location ? String(location) : undefined
    );

    // Return as file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="yahaml-${contestId}-${new Date().toISOString().slice(0, 10)}.log"`
    );
    res.send(cabrilloContent);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'CABRILLO export failed', details: message });
  }
});

app.get('/api/export/reverse-log', async (req, res): Promise<void> => {
  try {
    const { contestId, remote_call: remoteCall, stationId, location } = req.query;

    if (!contestId) {
      res.status(400).json({ error: 'contestId is required' });
      return;
    }

    if (!remoteCall) {
      res.status(400).json({ error: 'remote_call is required' });
      return;
    }

    // Fetch contest
    const contest = await prisma.contest.findUnique({
      where: { id: String(contestId) },
    });

    if (!contest) {
      res.status(404).json({ error: 'Contest not found' });
      return;
    }

    // Fetch all QSOs WITH the remote call (reverse perspective)
    const entries = await prisma.logEntry.findMany({
      where: {
        contestId: String(contestId),
        callsign: String(remoteCall),
        merge_status: { not: 'duplicate_of' },
      },
      orderBy: { qsoDate: 'asc' },
    });

    if (entries.length === 0) {
      res.status(404).json({
        error: 'No QSO entries found for remote station',
      });
      return;
    }

    // Get local callsign
    let callsign = 'UNKNOWN';
    if (stationId) {
      const station = await prisma.station.findUnique({
        where: { id: String(stationId) },
      });
      if (station) {
        callsign = station.callsign;
      }
    }

    // Generate CABRILLO format for reverse-log
    const cabrilloContent = generateCabrilloContent(
      entries,
      callsign,
      `${contest.name} (Reverse-Log for ${remoteCall})`,
      location ? String(location) : undefined
    );

    // Return as file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reverse-log-${contestId}-${remoteCall}-${new Date().toISOString().slice(0, 10)}.log"`
    );
    res.send(cabrilloContent);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: 'Reverse-log export failed',
      details: message,
    });
  }
});

// Context log endpoints
app.get('/api/context-logs/:stationId', async (req, res) => {
  try {
    const logs = await prisma.contextLog.findMany({
      where: { stationId: req.params.stationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch context logs' });
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.post('/api/context-logs', async (req, res) => {
  try {
    const log = await prisma.contextLog.create({
      data: req.body,
    });
    return res.status(201).json(log);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create context log' });
  }
});

// Contest endpoints
app.get('/api/contests', async (_req, res) => {
  try {
    const contests = await prisma.contest.findMany({
      include: {
        clubs: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(contests);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contests' });
  }
});

app.get('/api/contests/:id', async (req, res) => {
  try {
    const contest = await prisma.contest.findUnique({
      where: { id: req.params.id },
      include: {
        clubs: {
          include: {
            stations: {
              include: {
                bandActivities: true,
                qsoLogs: true,
              },
            },
          },
        },
      },
    });
    return res.json(contest);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contest' });
  }
});

app.post('/api/contests', async (req, res) => {
  try {
    const contest = await prisma.contest.create({
      data: req.body,
    });
    return res.status(201).json(contest);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create contest' });
  }
});

app.patch('/api/contests/:id', async (req, res) => {
  try {
    const contest = await prisma.contest.update({
      where: { id: req.params.id },
      data: req.body,
    });
    return res.json(contest);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to update contest' });
  }
});

// Get or create active contest
app.get('/api/contests/active/current', async (_req, res) => {
  try {
    let contest = await prisma.contest.findFirst({
      where: { isActive: true },
      include: {
        clubs: true,
        template: true,
      },
    });
    
    if (!contest) {
      // Create default Field Day contest if none exists
      contest = await prisma.contest.create({
        data: {
          name: 'Field Day',
          mode: 'FIELD_DAY',
          scoringMode: 'ARRL',
        },
        include: {
          clubs: true,
          template: true,
        },
      });
    }
    
    return res.json(contest);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch active contest' });
  }
});

// Contest Template endpoints
app.get('/api/contest-templates', async (_req, res) => {
  try {
    const templates = await prisma.contestTemplate.findMany({
      where: { isPublic: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    return res.json(templates);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch contest templates' });
  }
});

app.get('/api/contest-templates/:id', async (req, res) => {
  try {
    const template = await prisma.contestTemplate.findUnique({
      where: { id: req.params.id },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    return res.json(template);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

app.get('/api/contest-templates/by-type/:type', async (req, res) => {
  try {
    const template = await prisma.contestTemplate.findUnique({
      where: { type: req.params.type },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    return res.json(template);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create contest from template
app.post('/api/contests/from-template', async (req, res) => {
  try {
    const { templateId, name, startTime, endTime, config } = req.body;
    
    // Validate required fields
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }
    
    const template = await prisma.contestTemplate.findUnique({
      where: { id: templateId },
    });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Deactivate any existing active contests
    await prisma.contest.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    
    const contest = await prisma.contest.create({
      data: {
        name: name || template.name,
        templateId: template.id,
        mode: template.type,
        isActive: true,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        config: config ? JSON.stringify(config) : undefined,
      },
      include: {
        template: true,
        clubs: true,
      },
    });
    
    // Add computed fields
    const contestWithStats = {
      ...contest,
      totalQsos: 0,
      totalPoints: 0,
    };
    
    return res.status(201).json(contestWithStats);
  } catch (error) {
    console.error('Failed to create contest from template:', error);
    return res.status(400).json({ error: 'Failed to create contest' });
  }
});

// Club endpoints
app.get('/api/clubs', async (_req, res) => {
  try {
    const clubs = await prisma.club.findMany({
      include: {
        stations: {
          include: {
            bandActivities: true,
            qsoLogs: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return res.json(clubs);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch clubs' });
  }
});

app.post('/api/clubs', async (req, res) => {
  try {
    const club = await prisma.club.create({
      data: req.body,
      include: {
        stations: true,
      },
    });
    return res.status(201).json(club);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to create club' });
  }
});

app.patch('/api/clubs/:id', async (req, res) => {
  try {
    const club = await prisma.club.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        stations: true,
      },
    });
    return res.json(club);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Club not found' });
    }
    return res.status(400).json({ error: 'Failed to update club' });
  }
});

app.delete('/api/clubs/:id', async (req, res) => {
  try {
    // Check if club has any associated stations with QSO logs
    const club = await prisma.club.findUnique({
      where: { id: req.params.id },
      include: {
        stations: {
          include: {
            _count: {
              select: { qsoLogs: true }
            }
          }
        }
      }
    });
    
    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }
    
    const hasLogs = club.stations.some(station => station._count.qsoLogs > 0);
    
    if (hasLogs) {
      return res.status(400).json({ 
        error: 'Cannot delete club with associated QSO logs. Disable it instead.',
        hasLogs: true 
      });
    }
    
    await prisma.club.delete({
      where: { id: req.params.id },
    });
    
    return res.status(204).send();
  } catch (error) {
    console.error('Failed to delete club:', error);
    return res.status(400).json({ error: 'Failed to delete club' });
  }
});

// Special Callsign endpoints
app.get('/api/special-callsigns', async (_req, res) => {
  try {
    const callsigns = await prisma.specialCallsign.findMany({
      include: {
        club: true,
      },
      orderBy: { startDate: 'desc' },
    });
    return res.json(callsigns);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch special callsigns' });
  }
});

app.get('/api/special-callsigns/active', async (_req, res) => {
  try {
    const now = new Date();
    const callsigns = await prisma.specialCallsign.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        club: true,
      },
      orderBy: { eventName: 'asc' },
    });
    return res.json(callsigns);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch active special callsigns' });
  }
});

app.post('/api/special-callsigns', async (req, res) => {
  try {
    const { callsign, eventName, startDate, endDate, clubId, ...rest } = req.body;
    
    // Validate required fields
    if (!callsign || !eventName) {
      return res.status(400).json({ error: 'callsign and eventName are required' });
    }
    
    const specialCallsign = await prisma.specialCallsign.create({
      data: {
        callsign,
        eventName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        clubId: clubId || null, // Optional club association
        ...rest,
      },
    });
    return res.status(201).json(specialCallsign);
  } catch (error) {
    console.error('Failed to create special callsign:', error);
    return res.status(400).json({ error: 'Failed to create special callsign' });
  }
});

app.patch('/api/special-callsigns/:id', async (req, res) => {
  try {
    const data: any = { ...req.body };
    if (req.body.startDate) data.startDate = new Date(req.body.startDate);
    if (req.body.endDate) data.endDate = new Date(req.body.endDate);
    
    const callsign = await prisma.specialCallsign.update({
      where: { id: req.params.id },
      data,
      include: {
        club: true,
      },
    });
    return res.json(callsign);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Special callsign not found' });
    }
    return res.status(400).json({ error: 'Failed to update special callsign' });
  }
});

app.delete('/api/special-callsigns/:id', async (req, res) => {
  try {
    await prisma.specialCallsign.delete({
      where: { id: req.params.id },
    });
    return res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Special callsign not found' });
    }
    return res.status(400).json({ error: 'Failed to delete special callsign' });
  }
});

// Admin endpoint to activate Field Day mode
app.post('/api/admin/activate-field-day', async (_req, res) => {
  try {
    // Deactivate any active contests
    await prisma.contest.updateMany({
      where: { isActive: true },
      data: { isActive: false, endTime: new Date() },
    });

    // Create or activate Field Day contest
    const now = new Date();
    const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

    const contest = await prisma.contest.create({
      data: {
        name: 'Field Day',
        mode: 'FIELD_DAY',
        isActive: true,
        startTime: now,
        endTime,
        duration: 24,
        scoringMode: 'ARRL',
        pointsPerQso: 1,
        powerBonus: true,
      },
    });

    // Log the event
    await prisma.contextLog.create({
      data: {
        stationId: 'admin',
        level: 'SUCCESS',
        category: 'NOTE',
        message: 'Field Day mode activated',
        details: JSON.stringify({ contestId: contest.id }),
      },
    });

    return res.json({ success: true, contest });
  } catch (error) {
    return res.status(400).json({ error: 'Failed to activate Field Day' });
  }
});

// Admin endpoint to deactivate contest
app.post('/api/admin/stop-contest', async (_req, res) => {
  try {
    const contest = await prisma.contest.updateMany({
      where: { isActive: true },
      data: { isActive: false, endTime: new Date() },
    });

    await prisma.contextLog.create({
      data: {
        stationId: 'admin',
        level: 'INFO',
        category: 'NOTE',
        message: 'Contest stopped',
      },
    });

    return res.json({ success: true, updated: contest.count });
  } catch (error) {
    return res.status(400).json({ error: 'Failed to stop contest' });
  }
});

// Admin callsign whitelist endpoints
let adminCallsignList: string[] = []; // In-memory for now

app.get('/api/admin/callsigns', (_req, res) => {
  return res.json({ callsigns: adminCallsignList });
});

app.post('/api/admin/callsigns', (req, res) => {
  const { callsigns } = req.body;
  if (!Array.isArray(callsigns)) {
    return res.status(400).json({ error: 'callsigns must be an array' });
  }
  adminCallsignList = callsigns.map((c: string) => c.toUpperCase());
  return res.json({ callsigns: adminCallsignList });
});

// ============================================================================
// RADIO / HAMLIB ENDPOINTS
// ============================================================================

// Get all radio connections
app.get('/api/radios', async (_req, res) => {
  try {
    const radios = await prisma.radioConnection.findMany({
      orderBy: { name: 'asc' },
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            station: true,
          },
        },
      },
    });
    return res.json(radios);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get single radio connection
app.get('/api/radios/:id', async (req, res) => {
  try {
    const radio = await prisma.radioConnection.findUnique({
      where: { id: req.params.id },
      include: {
        assignments: {
          include: {
            station: true,
          },
        },
      },
    });
    
    if (!radio) {
      return res.status(404).json({ error: 'Radio not found' });
    }
    
    return res.json(radio);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Create radio connection
app.post('/api/radios', async (req, res) => {
  try {
    const { name, host, port, pollInterval } = req.body;
    
    if (!name || !host) {
      return res.status(400).json({ error: 'name and host are required' });
    }
    
    const radio = await prisma.radioConnection.create({
      data: {
        name,
        host,
        port: port || 4532,
        pollInterval: pollInterval || 1000,
        isEnabled: false,
      },
    });
    
    return res.status(201).json(radio);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Update radio connection
app.put('/api/radios/:id', async (req, res) => {
  try {
    const { name, host, port, pollInterval, isEnabled } = req.body;
    
    const radio = await prisma.radioConnection.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name : undefined,
        host: host !== undefined ? host : undefined,
        port: port !== undefined ? port : undefined,
        pollInterval: pollInterval !== undefined ? pollInterval : undefined,
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
      },
    });
    
    // If enabled, start the radio
    if (isEnabled) {
      await radioManager.startRadio(radio.id);
    } else {
      await radioManager.stopRadio(radio.id);
    }
    
    return res.json(radio);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Radio not found' });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Delete radio connection
app.delete('/api/radios/:id', async (req, res) => {
  try {
    // Stop radio if running
    await radioManager.stopRadio(req.params.id);
    
    // Delete assignments first
    await prisma.radioAssignment.deleteMany({
      where: { radioId: req.params.id },
    });
    
    // Delete radio
    await prisma.radioConnection.delete({
      where: { id: req.params.id },
    });
    
    return res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Radio not found' });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Test radio connection (without saving)
app.post('/api/radios/test-connection', async (req, res) => {
  try {
    const { host, port } = req.body;
    
    if (!host || !port) {
      return res.status(400).json({ error: 'host and port are required' });
    }
    
    // Import HamlibClient dynamically to avoid circular dependency
    const { HamlibClient } = await import('./hamlib');
    
    // Create temporary client
    const client = new HamlibClient(host, Number(port));
    
    // Try to connect
    const connected = await client.connect();
    
    if (!connected) {
      client.disconnect();
      return res.status(400).json({ 
        success: false, 
        error: 'Failed to connect to rigctld server. Check host, port, and ensure rigctld is running.' 
      });
    }
    
    // Get radio state
    try {
      const state = await client.getState();
      const info = await client.getInfo();
      
      client.disconnect();
      
      return res.json({ 
        success: true, 
        state,
        info: info || 'Unknown radio',
        message: 'Connection successful!'
      });
    } catch (error: any) {
      client.disconnect();
      return res.status(400).json({ 
        success: false, 
        error: `Connected but failed to get radio state: ${error.message}` 
      });
    }
  } catch (error: any) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start/connect radio
app.post('/api/radios/:id/start', async (req, res) => {
  try {
    const success = await radioManager.startRadio(req.params.id);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to connect to radio' });
    }
    
    const radio = await prisma.radioConnection.findUnique({
      where: { id: req.params.id },
    });
    
    return res.json(radio);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Stop/disconnect radio
app.post('/api/radios/:id/stop', async (req, res) => {
  try {
    await radioManager.stopRadio(req.params.id);
    
    const radio = await prisma.radioConnection.findUnique({
      where: { id: req.params.id },
    });
    
    return res.json(radio);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Test radio connection
app.post('/api/radios/:id/test', async (req, res) => {
  try {
    const client = radioManager.getClient(req.params.id);
    
    if (!client) {
      return res.status(400).json({ error: 'Radio not connected. Start it first.' });
    }
    
    const state = await client.getState();
    return res.json({ success: true, state });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RADIO ASSIGNMENT ENDPOINTS
// ============================================================================

// Get all radio assignments
app.get('/api/radio-assignments', async (_req, res) => {
  try {
    const assignments = await prisma.radioAssignment.findMany({
      include: {
        radio: true,
        station: true,
      },
      orderBy: { assignedAt: 'desc' },
    });
    return res.json(assignments);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get active assignments
app.get('/api/radio-assignments/active', async (_req, res) => {
  try {
    const assignments = await prisma.radioAssignment.findMany({
      where: { isActive: true },
      include: {
        radio: true,
        station: true,
      },
    });
    return res.json(assignments);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Assign radio to station
app.post('/api/radio-assignments', async (req, res) => {
  try {
    const { radioId, stationId } = req.body;
    
    if (!radioId || !stationId) {
      return res.status(400).json({ error: 'radioId and stationId are required' });
    }
    
    // Deactivate any existing assignments for this radio
    await prisma.radioAssignment.updateMany({
      where: {
        radioId,
        isActive: true,
      },
      data: {
        isActive: false,
        unassignedAt: new Date(),
      },
    });
    
    // Create new assignment
    const assignment = await prisma.radioAssignment.create({
      data: {
        radioId,
        stationId,
        isActive: true,
      },
      include: {
        radio: true,
        station: true,
      },
    });
    
    return res.status(201).json(assignment);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Unassign radio from station
app.post('/api/radio-assignments/:id/unassign', async (req, res) => {
  try {
    const assignment = await prisma.radioAssignment.update({
      where: { id: req.params.id },
      data: {
        isActive: false,
        unassignedAt: new Date(),
      },
      include: {
        radio: true,
        station: true,
      },
    });
    
    return res.json(assignment);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Get station's current radio
app.get('/api/stations/:id/radio', async (req, res) => {
  try {
    const assignment = await prisma.radioAssignment.findFirst({
      where: {
        stationId: req.params.id,
        isActive: true,
      },
      include: {
        radio: true,
      },
    });
    
    if (!assignment) {
      return res.json({ radio: null });
    }
    
    return res.json({ radio: assignment.radio });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Export the app for testing
export default app;

// Only start servers if this file is run directly (not imported for testing)
if (require.main === module) {
  // Start HTTP server (for WebSocket support)
  const server = http.createServer(app);

  // Initialize WebSocket server
  wsManager.initialize(server);

  server.listen(Number(port), host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`✓ YAHAML API server running on http://${displayHost}:${port}`);
    console.log(`  - Binding to: ${host}:${port} (accessible from all interfaces)`);
    console.log(`  - Health check: http://${displayHost}:${port}/health`);
    console.log(`  - API base: http://${displayHost}:${port}/api`);
    console.log(`  - WebSocket: ws://${displayHost}:${port}/ws`);
  });

  // Start relay server
  startRelayServer(Number(relayPort), relayHost);

  // Start UDP log listener
  startUdpServer(Number(udpPort), udpHost, udpTargets);

  // Start radio manager (connect to all enabled radios)
  radioManager.startAll().then(() => {
    console.log('✓ Radio manager initialized');
  }).catch((error) => {
    console.error('Radio manager initialization error:', error);
  });
}
