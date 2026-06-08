import { Request, Response, NextFunction } from 'express';
import {
  createSession,
  validateSession,
  logout,
  cleanupExpiredSessions,
  getActiveSessionsCount,
  getSessionStats,
  getExpiredSessions,
  SessionData,
  SessionOptions,
} from './session-management';

export interface SessionRequest extends Request {
  session?: SessionData;
}

export interface CreateSessionBody extends SessionOptions {
  callsign: string;
}

export interface SessionResponse {
  token: string;
  callsign: string;
  stationId: string;
  expiresAt: string;
  lastActivity: string;
}

export interface SessionValidationResponse {
  valid: boolean;
  session?: SessionResponse;
  reason?: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  sessionsBySource: Record<string, number>;
}

export function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.query.token as string;

  if (!token) {
    res.status(401).json({
      error: 'Missing session token',
    });
    return;
  }

  validateSession(token)
    .then(result => {
      if (!result.valid) {
        res.status(401).json({
          error: result.reason,
        });
        return;
      }

      (req as SessionRequest).session = result.session;
      next();
    })
    .catch(error => {
      console.error('[Session] Validation error:', error);
      res.status(500).json({
        error: 'Session validation failed',
      });
    });
}

export async function createSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const body = req.body as CreateSessionBody;

  if (!body.callsign || !body.stationId) {
    res.status(400).json({
      error: 'Missing required fields: callsign, stationId',
    });
    return;
  }

  try {
    const session = await createSession({
      callsign: body.callsign,
      stationId: body.stationId,
      browserId: req.headers['x-browser-id'] as string,
      sourceType: req.headers['x-source-type'] as string,
      sourceInfo: req.headers['x-source-info'] as string,
    });

    res.json({
      success: true,
      session: {
        token: session.token,
        callsign: session.callsign,
        stationId: session.stationId,
        expiresAt: session.expiresAt.toISOString(),
        lastActivity: session.lastActivity.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function validateSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.query.token as string;

  if (!token) {
    res.status(400).json({
      error: 'Missing session token',
    });
    return;
  }

  try {
    const result = await validateSession(token);

    if (!result.valid) {
      res.status(401).json({
        valid: false,
        reason: result.reason,
      });
      return;
    }

    res.json({
      valid: true,
      session: {
        token: result.session?.token,
        callsign: result.session?.callsign,
        stationId: result.session?.stationId,
        expiresAt: result.session?.expiresAt?.toISOString(),
        lastActivity: result.session?.lastActivity?.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.query.token as string;

  if (!token) {
    res.status(400).json({
      error: 'Missing session token',
    });
    return;
  }

  try {
    const success = await logout(token);

    if (success) {
      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function getSessionCountHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const count = await getActiveSessionsCount();

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionStatsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getSessionStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
}

export async function getExpiredSessionsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessions = await getExpiredSessions();

    res.json({
      success: true,
      count: sessions.length || 0,
      sessions,
    });
  } catch (error) {
    next(error);
  }
}

export async function cleanupExpiredSessionsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const maxAgeMinutes = parseInt(req.query.maxAge as string, 10) || 20;
    const cleaned = await cleanupExpiredSessions(maxAgeMinutes);

    res.json({
      success: true,
      cleaned,
    });
  } catch (error) {
    next(error);
  }
}

export async function runSessionCleanup(): Promise<void> {
  try {
    console.log('[Session] Running session cleanup...');
    const cleaned = await cleanupExpiredSessions(20);
    console.log(`[Session] Cleaned up ${cleaned} expired sessions`);
  } catch (error) {
    console.error('[Session] Cleanup failed:', error);
  }
}

export function setupSessionRoutes(router: any): any {
  const routes = router;

  routes.post('/session', createSessionHandler);
  routes.get('/session/validate', validateSessionHandler);
  routes.get('/session/logout', logoutHandler);

  routes.get('/session/count', getSessionCountHandler);
  routes.get('/session/stats', getSessionStatsHandler);
  routes.get('/session/expired', getExpiredSessionsHandler);
  routes.post('/session/cleanup', cleanupExpiredSessionsHandler);

  return routes;
}
