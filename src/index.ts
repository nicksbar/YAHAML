import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Prisma } from '@prisma/client';
import prisma from './db';
import { validateQsoAgainstTemplate } from './contest-validation';
import { seedContestTemplates } from './seed-templates';
import { startRelayServer } from './relay';
import { parseUdpTargets, startUdpServer } from './udp';
import { radioManager } from './hamlib';
import {
  generateAdifContent,
  generateCabrilloContent,
  validateCabrilloQso,
} from './export';
import { wsManager } from './websocket';
import { startStatsAggregationJob } from './stats';
import {
  updateAggregates,
  getAggregates,
  getScoreboard,
  getBandOccupancy,
  getOperatorActivity,
} from './aggregation';
import { calculateNextOccurrence } from './contest-templates/scheduler';
import { lookupCallsign, validateCallsign } from './hamdb';
import { locationRouter } from './location-api';

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

// Session management endpoints
// POST /api/sessions - Create a new session (login)
app.post('/api/sessions', async (req, res) => {
  try {
    const { callsign, stationId, browserId } = req.body;
    
    if (!callsign || !stationId) {
      return res.status(400).json({ error: 'callsign and stationId required' });
    }
    
    // Verify station exists
    const station = await prisma.station.findUnique({
      where: { id: stationId }
    });
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // Generate secure token (base64 encoded random bytes)
    const token = Buffer.from(`${Date.now()}-${Math.random()}-${callsign}`).toString('base64');
    
    // Create session with 20 min expiry
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        token,
        callsign,
        stationId,
        browserId: browserId || undefined,
        expiresAt,
      }
    });
    
    res.json({ token, expiresAt, sessionId: session.id });
    return;
  } catch (error) {
    console.error('Session creation error:', error);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/:token - Validate and refresh session
app.get('/api/sessions/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find session and check expiry
    const session = await prisma.session.findUnique({
      where: { token },
      include: { station: true }
    });
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    // Check if expired
    if (new Date() > session.expiresAt) {
      // Delete expired session
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: 'Session expired' });
    }
    
    // Check for inactivity (20 mins)
    const now = new Date();
    const inactiveMs = now.getTime() - session.lastActivity.getTime();
    const inactiveMin = inactiveMs / (1000 * 60);
    
    if (inactiveMin > 20) {
      // Delete inactive session
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: 'Session expired due to inactivity' });
    }
    
    // Refresh last activity
    const updatedSession = await prisma.session.update({
      where: { id: session.id },
      data: { lastActivity: now }
    });
    
    res.json({
      valid: true,
      sessionId: session.id,
      callsign: session.callsign,
      stationId: session.stationId,
      station: session.station,
      expiresAt: updatedSession.expiresAt,
      lastActivity: updatedSession.lastActivity
    });
    return;
  } catch (error) {
    console.error('Session validation error:', error);
    return res.status(500).json({ error: 'Failed to validate session' });
  }
});

// DELETE /api/sessions/:token - Logout (destroy session)
app.delete('/api/sessions/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const session = await prisma.session.findUnique({ where: { token } });
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    await prisma.session.delete({ where: { id: session.id } });
    
    res.json({ success: true });
    return;
  } catch (error) {
    console.error('Session deletion error:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Auth middleware - validates session and updates lastActivity
interface AuthRequest extends express.Request {
  sessionToken?: string;
  session?: { id: string; callsign: string; stationId: string };
}

const authMiddleware = async (
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header or query param
    const authHeader = req.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') || req.query.token as string;
    
    if (!token) {
      res.status(401).json({ error: 'No session token' });
      return;
    }
    
    // Validate session
    const session = await prisma.session.findUnique({
      where: { token },
      include: { station: true }
    });
    
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    
    // Check expiry and inactivity
    const now = new Date();
    
    if (now > session.expiresAt) {
      await prisma.session.delete({ where: { id: session.id } });
      res.status(401).json({ error: 'Session expired' });
      return;
    }
    
    const inactiveMs = now.getTime() - session.lastActivity.getTime();
    const inactiveMin = inactiveMs / (1000 * 60);
    
    if (inactiveMin > 20) {
      await prisma.session.delete({ where: { id: session.id } });
      res.status(401).json({ error: 'Session expired due to inactivity' });
      return;
    }
    
    // Update last activity
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActivity: now }
    });
    
    // Attach to request
    req.sessionToken = token;
    req.session = {
      id: session.id,
      callsign: session.callsign,
      stationId: session.stationId
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Admin callsign whitelist (in-memory for now)
let adminCallsignList: string[] = [];

const isAdminCallsign = (callsign?: string | null): boolean => {
  if (!callsign) {
    return false;
  }
  return adminCallsignList.includes(callsign.toUpperCase());
};

const requireAdmin = (
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
): void => {
  if (adminCallsignList.length === 0) {
    res.status(403).json({ error: 'Admin callsigns not configured' });
    return;
  }

  if (!isAdminCallsign(req.session?.callsign)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};

// Stations endpoints
app.get('/api/stations', async (req, res) => {
  try {
    const callsignQuery = typeof req.query.callsign === 'string' ? req.query.callsign.trim() : '';
    const whereClause = callsignQuery
      ? {
          callsign: {
            equals: callsignQuery,
            mode: Prisma.QueryMode.insensitive,
          },
        }
      : undefined;
    const stations = await prisma.station.findMany({
      where: whereClause,
      include: {
        location: true,
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
    // Support both ID and callsign lookups
    const isId = /^[a-z0-9]+$/.test(req.params.id) && req.params.id.length > 10;
    console.log(`Fetching station: id="${req.params.id}", isId=${isId}`);
    const station = await prisma.station.findUnique({
      where: isId 
        ? { id: req.params.id }
        : { callsign: req.params.id.toUpperCase() },
      include: {
        location: true,
        bandActivities: true,
        qsoLogs: { orderBy: { qsoDate: 'desc' }, take: 10 },
        contextLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        networkStatus: true,
      },
    });
    console.log(`Station result:`, station);
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    return res.json(station);
  } catch (error) {
    console.error('Error fetching station:', error);
    return res.status(500).json({ error: 'Failed to fetch station' });
  }
});

app.post('/api/stations', async (req, res) => {
  try {
    const { callsign, name, class: stationClass, locationId } = req.body;
    const validation = await validateCallsign(callsign);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid callsign',
        details: 'Callsign format is not valid',
      });
    }
    const station = await prisma.station.create({
      data: {
        callsign,
        name,
        class: stationClass,
        locationId,
      },
    });
    return res.status(201).json(station);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res.status(409).json({
          error: 'Callsign already exists',
          details: 'A station with this callsign is already registered.',
        });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({
          error: 'Invalid location',
          details: 'The selected location does not exist.',
        });
      }
    }
    return res.status(400).json({
      error: 'Failed to create station',
      details: 'Please verify the callsign and required fields and try again.',
    });
  }
});

app.patch('/api/stations/:callsign', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
  try {
    const validation = await validateCallsign(req.params.callsign);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid callsign',
        details: 'Callsign format is not valid',
      });
    }

    const existingStation = await prisma.station.findUnique({
      where: { callsign: req.params.callsign },
    });

    if (!existingStation) {
      return res.status(404).json({
        error: 'Station not found',
        details: 'Save the callsign first or create a new station.',
      });
    }

    if (req.session?.stationId !== existingStation.id) {
      return res.status(403).json({
        error: 'Unauthorized station update',
        details: 'You can only update your own station.',
      });
    }
    const { 
      name, 
      class: stationClass, 
      section,
      address,
      city,
      state,
      zip,
      country,
      locationId, 
      clubId,
      contestId
    } = req.body;
    const station = await prisma.station.update({
      where: { callsign: req.params.callsign },
      data: {
        name,
        class: stationClass,
        section, // Deprecated but still supported for backward compatibility
        address,
        city,
        state,
        zip,
        country,
        locationId,
        clubId,
        contestId,
      },
    });
    return res.json(station);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({
          error: 'Station not found',
          details: 'Save the callsign first or create a new station.',
        });
      }
      if (error.code === 'P2003') {
        return res.status(400).json({
          error: 'Invalid reference',
          details: 'The selected club or location does not exist.',
        });
      }
    }
    return res.status(400).json({
      error: 'Failed to update station',
      details: 'Please check the form values and try again.',
    });
  }
});

app.post('/api/band-activity', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
  try {
    const { stationId, band, mode, frequency, power } = req.body;

    if (req.session?.stationId !== stationId) {
      return res.status(403).json({ error: 'Unauthorized band activity update' });
    }
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

// POST /api/qso-logs with auth - requires valid session
app.post('/api/qso-logs', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
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
      exchange,
      ...rest
    } = req.body;

    // Validate session owns this stationId
    if (req.session?.stationId !== stationId) {
      return res.status(403).json({ error: 'Cannot log QSOs for this station - session mismatch' });
    }

    if (!stationId || !callsign || !band || !mode || !qsoDate || !qsoTime) {
      return res.status(400).json({ error: 'Missing required QSO fields' });
    }

    const station = await prisma.station.findUnique({
      where: { id: stationId },
    });

    if (contestId) {
      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        include: { template: true },
      });

      if (contest?.template) {
        const validation = validateQsoAgainstTemplate(
          {
            band,
            mode,
            exchange,
          },
          contest.template,
        );

        if (!validation.valid) {
          return res.status(400).json({
            error: 'QSO failed contest validation',
            details: validation.errors,
          });
        }
      }
    }

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
app.post('/api/logs/merge', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
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

    if (req.session?.stationId !== primary.stationId) {
      return res.status(403).json({ error: 'Unauthorized log merge' });
    }

    const hasForeignDuplicate = duplicates.some(
      entry => entry.stationId !== req.session?.stationId,
    );
    if (hasForeignDuplicate) {
      return res.status(403).json({ error: 'Unauthorized log merge' });
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

// Get all debug logs for debug panel
app.get('/api/debug/all-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 200;
    const logs = await prisma.contextLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        station: { select: { callsign: true } },
      },
    });
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch debug logs' });
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.post('/api/context-logs', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
  try {
    const stationId = req.body?.stationId || req.session?.stationId;

    if (!stationId || req.session?.stationId !== stationId) {
      return res.status(403).json({ error: 'Unauthorized context log write' });
    }

    const log = await prisma.contextLog.create({
      data: {
        ...req.body,
        stationId,
      },
    });
    // Broadcast to debug listeners
    wsManager.broadcast('logs', 'contextLog', log);
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

// Get upcoming contests based on template schedules
// MUST be before /api/contests/:id to avoid :id catching "upcoming"
app.get('/api/contests/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const includeYearRound = req.query.includeYearRound === 'true';
    const showRecentDays = parseInt(req.query.showRecentDays as string) || 10;

    // Fetch templates from database
    const dbTemplates = await prisma.contestTemplate.findMany({
      where: { isPublic: true, isActive: true },
    });

    console.log(`[Upcoming Contests] Loaded ${dbTemplates.length} templates from DB`);

    // Convert DB templates to ContestTemplate format with parsed JSON
    const templates = dbTemplates.map(t => ({
      type: t.type,
      name: t.name,
      description: t.description || '',
      organization: t.organization || '',
      scoringRules: JSON.parse(t.scoringRules),
      requiredFields: JSON.parse(t.requiredFields),
      validationRules: JSON.parse(t.validationRules),
      schedule: t.schedule ? JSON.parse(t.schedule) : undefined,
      uiConfig: t.uiConfig ? JSON.parse(t.uiConfig) : undefined,
      isActive: t.isActive,
      isPublic: t.isPublic,
    }));

    console.log(`[Upcoming Contests] Converted ${templates.length} templates, ${templates.filter(t => t.schedule).length} have schedules`);

    // Calculate upcoming contests
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - showRecentDays * 24 * 60 * 60 * 1000);
    
    const upcoming: any[] = [];
    
    for (const template of templates) {
      const next = calculateNextOccurrence(template, now);
      console.log(`[Upcoming Contests] ${template.name}: ${next ? next.status : 'null'}`);
      if (next) {
        // Include if upcoming OR recently ended (within showRecentDays)
        if (next.status === 'upcoming' || next.status === 'active' || 
            (next.status === 'past' && next.endDate >= recentCutoff)) {
          // Recalculate status considering recent window
          const adjustedStatus = next.endDate >= now ? 
            (next.startDate <= now ? 'active' : 'upcoming') : 
            'recent';
          
          upcoming.push({
            ...next,
            status: adjustedStatus,
          });
        }
        
        // Don't include year-round unless requested
        if (!includeYearRound && template.schedule?.type === 'year-round') {
          upcoming.pop();
        }
      }
    }

    // Sort by start date (recent/active first, then upcoming)
    upcoming.sort((a, b) => {
      // Active contests first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      
      // Then by start date
      return a.startDate.getTime() - b.startDate.getTime();
    });

    console.log(`[Upcoming Contests] Found ${upcoming.length} contests (showing recent + upcoming)`);
    
    if (upcoming.length > 0) {
      console.log(`[Upcoming Contests] Next: ${upcoming[0].template.name} - ${upcoming[0].status}`);
    }

    return res.json(upcoming.slice(0, limit));
  } catch (error) {
    console.error('Failed to calculate upcoming contests:', error);
    return res.status(500).json({ error: 'Failed to calculate upcoming contests' });
  }
});

// Get or create active contest
// MUST be before /api/contests/:id to avoid :id catching "active"
app.get('/api/contests/active/current', async (_req, res) => {
  try {
    // Return the currently active contest, or null if none
    const contest = await prisma.contest.findFirst({
      where: { isActive: true },
      include: {
        clubs: true,
        template: true,
      },
    });
    
    return res.json(contest);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch active contest' });
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

// DEBUG endpoint to test upcoming contests logic
app.get('/api/contests/upcoming/debug', async (_req, res) => {
  try {
    const dbCount = await prisma.contestTemplate.count();
    const activeCount = await prisma.contestTemplate.count({ where: { isActive: true, isPublic: true } });
    const withSchedule = await prisma.contestTemplate.count({ where: { schedule: { not: null } } });
    
    return res.json({
      totalTemplates: dbCount,
      activePublicTemplates: activeCount,
      templatesWithSchedule: withSchedule,
      calculatorImported: typeof calculateNextOccurrence === 'function',
    });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post('/api/contest-templates/seed', async (req, res) => {
  try {
    const force = Boolean(req.body?.force);
    const existingCount = await prisma.contestTemplate.count();

    if (existingCount > 0 && !force) {
      return res.status(200).json({
        seeded: false,
        count: existingCount,
        message: 'Templates already exist. Use force=true to reseed.',
      });
    }

    await seedContestTemplates();
    const updatedCount = await prisma.contestTemplate.count();

    return res.status(200).json({
      seeded: true,
      count: updatedCount,
      message: 'Templates seeded successfully.',
    });
  } catch (error) {
    console.error('Failed to seed contest templates:', error);
    return res.status(500).json({ error: 'Failed to seed contest templates' });
  }
});

app.post('/api/contest-templates', async (req, res) => {
  try {
    const {
      type,
      name,
      description,
      organization,
      scoringRules,
      requiredFields,
      validationRules,
      uiConfig,
      isActive,
      isPublic,
    } = req.body;

    if (!type || !name || !scoringRules || !requiredFields || !validationRules) {
      return res.status(400).json({
        error: 'type, name, scoringRules, requiredFields, and validationRules are required',
      });
    }

    const toJsonString = (value: unknown) => (
      typeof value === 'string' ? value : JSON.stringify(value)
    );

    const createdTemplate = await prisma.contestTemplate.create({
      data: {
        type,
        name,
        description,
        organization,
        scoringRules: toJsonString(scoringRules),
        requiredFields: toJsonString(requiredFields),
        validationRules: toJsonString(validationRules),
        uiConfig: uiConfig ? toJsonString(uiConfig) : null,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        isPublic: typeof isPublic === 'boolean' ? isPublic : true,
      },
    });

    return res.status(201).json(createdTemplate);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'Template type already exists' });
    }
    return res.status(400).json({ error: 'Failed to create contest template' });
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

app.patch('/api/contest-templates/:id', async (req, res) => {
  try {
    const {
      type,
      name,
      description,
      organization,
      scoringRules,
      requiredFields,
      validationRules,
      uiConfig,
      isActive,
      isPublic,
    } = req.body;

    const toJsonString = (value: unknown) => (
      typeof value === 'string' ? value : JSON.stringify(value)
    );

    const data: Record<string, unknown> = {};

    if (type !== undefined) data.type = type;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (organization !== undefined) data.organization = organization;
    if (scoringRules !== undefined) data.scoringRules = toJsonString(scoringRules);
    if (requiredFields !== undefined) data.requiredFields = toJsonString(requiredFields);
    if (validationRules !== undefined) data.validationRules = toJsonString(validationRules);
    if (uiConfig !== undefined) data.uiConfig = uiConfig ? toJsonString(uiConfig) : null;
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (typeof isPublic === 'boolean') data.isPublic = isPublic;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const updated = await prisma.contestTemplate.update({
      where: { id: req.params.id },
      data,
    });

    return res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'Template type already exists' });
    }
    return res.status(400).json({ error: 'Failed to update contest template' });
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

// Admin endpoint: Activate a contest by ID
app.post(
  '/api/admin/activate-contest/:id',
  authMiddleware as express.RequestHandler,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      // Verify contest exists
      const contest = await prisma.contest.findUnique({
        where: { id },
      });

      if (!contest) {
        return res.status(404).json({ error: 'Contest not found' });
      }

      // Deactivate any other active contests
      await prisma.contest.updateMany({
        where: { isActive: true, id: { not: id } },
        data: { isActive: false },
      });

      // Activate this contest
      const updated = await prisma.contest.update({
        where: { id },
        data: { isActive: true },
        include: { clubs: true, template: true },
      });

      return res.json({ success: true, contest: updated });
    } catch (error) {
      return res.status(400).json({ error: 'Failed to activate contest' });
    }
  }
);

// Admin endpoint: Deactivate the active contest
app.post(
  '/api/admin/deactivate-contest',
  authMiddleware as express.RequestHandler,
  requireAdmin,
  async (_req: AuthRequest, res) => {
    try {
      const updated = await prisma.contest.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return res.json({ success: true, updated: updated.count });
    } catch (error) {
      return res.status(400).json({ error: 'Failed to deactivate contest' });
    }
  }
);

// DEPRECATED - Old hardcoded Field Day endpoint (kept for compatibility, use /activate-contest/:id instead)
app.post(
  '/api/admin/activate-field-day',
  authMiddleware as express.RequestHandler,
  requireAdmin,
  async (_req: AuthRequest, res) => {
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
  }
);

// Admin endpoint to deactivate contest
app.post(
  '/api/admin/stop-contest',
  authMiddleware as express.RequestHandler,
  requireAdmin,
  async (_req: AuthRequest, res) => {
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
  }
);

// Admin callsign whitelist endpoints
app.get(
  '/api/admin/callsigns',
  authMiddleware as express.RequestHandler,
  requireAdmin,
  (_req: AuthRequest, res) => {
    return res.json({ callsigns: adminCallsignList });
  }
);

app.post('/api/admin/callsigns', authMiddleware as express.RequestHandler, (req: AuthRequest, res) => {
  const { callsigns } = req.body;
  if (!Array.isArray(callsigns)) {
    return res.status(400).json({ error: 'callsigns must be an array' });
  }

  const normalized = callsigns.map((c: string) => c.toUpperCase());
  const caller = req.session?.callsign?.toUpperCase();

  if (adminCallsignList.length > 0 && !isAdminCallsign(caller)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (adminCallsignList.length === 0 && (!caller || !normalized.includes(caller))) {
    return res.status(403).json({
      error: 'Bootstrap requires your callsign in the list',
    });
  }

  adminCallsignList = normalized;
  return res.json({ callsigns: adminCallsignList });
});

// Lookup callsign via HamDB API
app.get('/api/callsign/lookup/:callsign', async (req, res) => {
  try {
    const { callsign } = req.params;
    
    if (!callsign || callsign.trim().length === 0) {
      return res.status(400).json({ error: 'Callsign is required' });
    }

    const info = await lookupCallsign(callsign);
    
    if (!info) {
      return res.status(404).json({ error: 'Callsign not found in HamDB' });
    }

    return res.json(info);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to lookup callsign' });
  }
});

// Mount location router
app.use('/api/locations', locationRouter);

// Get active contest configuration (bands/modes for UI)
app.get('/api/contests/active/config', async (_req, res) => {
  try {
    const contest = await prisma.contest.findFirst({
      where: { isActive: true },
      include: { template: true },
    });
    
    if (!contest?.template) {
      // Return defaults if no active contest
      return res.json({
        bands: ['160', '80', '40', '20', '15', '10', '6', '2', '70cm'],
        modes: ['CW', 'DIG', 'PH'],
      });
    }
    
    const rules = typeof contest.template.validationRules === 'string'
      ? JSON.parse(contest.template.validationRules)
      : contest.template.validationRules;
    
    return res.json({
      contestName: contest.name,
      contestId: contest.id,
      bands: rules.bands || ['160', '80', '40', '20', '15', '10', '6', '2', '70cm'],
      modes: rules.modes || ['CW', 'DIG', 'PH'],
    });
  } catch (error) {
    console.error('Error fetching active contest config:', error);
    return res.status(500).json({ error: (error as any).message });
  }
});

// Validate callsign
app.get('/api/callsign/validate/:callsign', async (req, res) => {
  try {
    const { callsign } = req.params;
    
    if (!callsign || callsign.trim().length === 0) {
      return res.status(400).json({ error: 'Callsign is required' });
    }

    const result = await validateCallsign(callsign, true);
    
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to validate callsign' });
  }
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

// Assign radio to station (requires auth - locks rig to callsign when active on logging screen)
app.post('/api/radio-assignments', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
  try {
    const { radioId, stationId } = req.body;
    
    if (!radioId || !stationId) {
      return res.status(400).json({ error: 'radioId and stationId are required' });
    }
    
    // Validate session owns this station
    if (req.session?.stationId !== stationId) {
      return res.status(403).json({ error: 'Cannot assign radio to this station - session mismatch' });
    }
    
    // Deactivate any existing assignments for this radio (rig is freed up)
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
    
    // Create new assignment (rig is now locked to this callsign)
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

// Unassign radio from station (frees up rig when not in use)
app.post('/api/radio-assignments/:id/unassign', authMiddleware as express.RequestHandler, async (req: AuthRequest, res) => {
  try {
    const assignment = await prisma.radioAssignment.findUnique({
      where: { id: req.params.id },
      include: { station: true }
    });
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Validate session owns this station
    if (req.session?.stationId !== assignment.stationId) {
      return res.status(403).json({ error: 'Cannot unassign radio from this station - session mismatch' });
    }
    
    const updated = await prisma.radioAssignment.update({
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
    
    return res.json(updated);
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

// Band occupancy endpoints
app.get('/api/band-occupancy', async (req, res) => {
  try {
    const { contestId } = req.query;
    
    const occupancy = await prisma.bandOccupancy.groupBy({
      by: ['band', 'mode'],
      where: contestId ? { contestId: String(contestId) } : undefined,
      _count: {
        stationId: true,
      },
    });

    // Enrich with active stations
    const enriched = await Promise.all(
      occupancy.map(async (entry) => {
        const stations = await prisma.bandOccupancy.findMany({
          where: {
            band: entry.band,
            mode: entry.mode,
            contestId: contestId ? String(contestId) : undefined,
          },
          include: {
            station: true,
          },
          orderBy: { lastSeen: 'desc' },
        });

        return {
          band: entry.band,
          mode: entry.mode,
          activeStations: stations.map((s) => ({
            callsign: s.station.callsign,
            source: s.source,
            lastSeen: s.lastSeen.toISOString(),
          })),
          count: stations.length,
        };
      })
    );

    return res.json(enriched);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// QSO Contacts (for map)
app.get('/api/qso-contacts', async (req, res) => {
  try {
    const { contestId, timeWindow = 'last-30min' } = req.query;
    
    // Calculate time filter
    const now = new Date();
    let sinceTime = new Date();
    
    switch (timeWindow) {
      case 'last-1h':
        sinceTime.setHours(sinceTime.getHours() - 1);
        break;
      case 'last-6h':
        sinceTime.setHours(sinceTime.getHours() - 6);
        break;
      case 'last-24h':
        sinceTime.setDate(sinceTime.getDate() - 1);
        break;
      case 'last-30min':
      default:
        sinceTime.setMinutes(sinceTime.getMinutes() - 30);
    }

    const contacts = await prisma.qSOContact.findMany({
      where: {
        contestId: contestId ? String(contestId) : undefined,
        qsoDateTime: {
          gte: sinceTime,
          lte: now,
        },
      },
      orderBy: { qsoDateTime: 'desc' },
      take: 200,
    });

    return res.json(contacts);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Operator messages
app.get('/api/operator-messages', async (req, res) => {
  try {
    const { contestId, limit = '20' } = req.query;

    const messages = await prisma.operatorMessage.findMany({
      where: {
        stationId: contestId ? undefined : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    return res.json(messages);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Contest stats
app.get('/api/contest-stats', async (req, res) => {
  try {
    const { contestId, period = 'hour' } = req.query;

    const stats = await prisma.contestStats.findFirst({
      where: {
        contestId: contestId ? String(contestId) : undefined,
        stationId: null, // Contest-wide only
        period: String(period),
      },
      orderBy: { periodStart: 'desc' },
    });

    if (!stats) {
      return res.json({
        qsoCount: 0,
        pointsTotal: 0,
        mults: 0,
        dupeCount: 0,
        qsoPerHour: 0,
        topCalls: [],
        bandDist: {},
        modeDist: {},
        lastUpdated: new Date().toISOString(),
      });
    }

    return res.json({
      qsoCount: stats.qsoCount,
      pointsTotal: stats.pointsTotal,
      mults: stats.mults,
      dupeCount: stats.dupeCount,
      qsoPerHour: stats.qsoCount / ((stats.periodEnd.getTime() - stats.periodStart.getTime()) / (1000 * 60 * 60)),
      topCalls: stats.topCallsign ? [{ callsign: stats.topCallsign, qsoCount: stats.topCallCount }] : [],
      bandDist: stats.bandDist ? JSON.parse(stats.bandDist) : {},
      modeDist: stats.modeDist ? JSON.parse(stats.modeDist) : {},
      lastUpdated: stats.updatedAt.toISOString(),
    });
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

  // Start stats aggregation job (runs every 5 minutes)
  startStatsAggregationJob(5);

  // Start radio manager (connect to all enabled radios)
  radioManager.startAll().then(() => {
    console.log('✓ Radio manager initialized');
  }).catch((error) => {
    console.error('Radio manager initialization error:', error);
  });
}
