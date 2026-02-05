/**
 * Location API endpoints
 * Manages saved operating locations
 */

import { Router } from 'express';
import db from './db';

export const locationRouter = Router();

// GET /api/locations - List all saved locations
locationRouter.get('/', async (_req, res) => {
  try {
    const locations = await db.location.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });
    res.json(locations);
  } catch (error) {
    console.error('Failed to fetch locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});
// GET /api/locations/zones - Lookup CQ and ITU zones by coordinates (MUST be before /:id)
locationRouter.get('/zones', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Simple zone lookup based on coordinates
    const cqZone = getCqZone(lat, lon);
    const ituZone = getItuZone(lat, lon);

    return res.json({ cqZone, ituZone });
  } catch (error) {
    console.error('Failed to lookup zones:', error);
    return res.status(500).json({ error: 'Failed to lookup zones' });
  }
});
// GET /api/locations/:id - Get specific location
locationRouter.get('/:id', async (req, res) => {
  try {
    const location = await db.location.findUnique({
      where: { id: req.params.id },
    });
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.json(location);
  } catch (error) {
    console.error('Failed to fetch location:', error);
    return res.status(500).json({ error: 'Failed to fetch location' });
  }
});

// POST /api/locations - Create new location
locationRouter.post('/', async (req, res) => {
  try {
    const {
      name,
      latitude,
      longitude,
      grid,
      elevation,
      section,
      county,
      cqZone,
      ituZone,
      isDefault,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Location name is required' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.location.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const location = await db.location.create({
      data: {
        name,
        latitude,
        longitude,
        grid,
        elevation,
        section,
        county,
        cqZone,
        ituZone,
        isDefault: isDefault || false,
      },
    });

    return res.json(location);
  } catch (error) {
    console.error('Failed to create location:', error);
    return res.status(500).json({ error: 'Failed to create location' });
  }
});

// PATCH /api/locations/:id - Update location
locationRouter.patch('/:id', async (req, res) => {
  try {
    const {
      name,
      latitude,
      longitude,
      grid,
      elevation,
      section,
      county,
      cqZone,
      ituZone,
      isDefault,
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.location.updateMany({
        where: { isDefault: true, id: { not: req.params.id } },
        data: { isDefault: false },
      });
    }

    const location = await db.location.update({
      where: { id: req.params.id },
      data: {
        name,
        latitude,
        longitude,
        grid,
        elevation,
        section,
        county,
        cqZone,
        ituZone,
        isDefault,
      },
    });

    res.json(location);
  } catch (error) {
    console.error('Failed to update location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// DELETE /api/locations/:id - Delete location
locationRouter.delete('/:id', async (req, res) => {
  try {
    await db.location.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete location:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// PATCH /api/locations/:id/set-default - Set as default location
locationRouter.patch('/:id/set-default', async (req, res) => {
  try {
    // Unset all other defaults
    await db.location.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });

    // Set this one as default
    const location = await db.location.update({
      where: { id: req.params.id },
      data: { isDefault: true },
    });

    res.json(location);
  } catch (error) {
    console.error('Failed to set default location:', error);
    res.status(500).json({ error: 'Failed to set default location' });
  }
});

// GET /api/location/zones - Lookup CQ and ITU zones by coordinates
locationRouter.get('/zones', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Simple zone lookup based on coordinates
    const cqZone = getCqZone(lat, lon);
    const ituZone = getItuZone(lat, lon);

    return res.json({ cqZone, ituZone });
  } catch (error) {
    console.error('Failed to lookup zones:', error);
    return res.status(500).json({ error: 'Failed to lookup zones' });
  }
});

/**
 * Determine CQ Zone from coordinates (1-40)
 * Simplified approximation based on geographic regions
 */
function getCqZone(lat: number, lon: number): number {
  // North America zones (approximate)
  if (lat >= 25 && lat <= 72 && lon >= -170 && lon <= -50) {
    if (lon >= -130 && lon <= -60 && lat >= 40 && lat <= 72) return 1; // Alaska/Canada
    if (lon >= -125 && lon <= -110 && lat >= 32 && lat <= 49) return 3; // US West
    if (lon >= -110 && lon <= -95 && lat >= 25 && lat <= 49) return 4; // US Central
    if (lon >= -95 && lon <= -60 && lat >= 25 && lat <= 49) return 5; // US East
  }
  
  // Europe zones (approximate)
  if (lat >= 35 && lat <= 72 && lon >= -10 && lon <= 40) {
    if (lon >= -10 && lon <= 10) return 14; // Western Europe
    if (lon >= 10 && lon <= 30) return 15; // Central Europe
    if (lon >= 30 && lon <= 40) return 16; // Eastern Europe
  }
  
  // Default: estimate from longitude
  const zoneLon = Math.floor((lon + 180) / 9) + 1;
  return Math.max(1, Math.min(40, zoneLon));
}

/**
 * Determine ITU Zone from coordinates (1-90)
 * Simplified approximation based on geographic regions
 */
function getItuZone(lat: number, lon: number): number {
  // North America zones (approximate)
  if (lat >= 25 && lat <= 72 && lon >= -170 && lon <= -50) {
    if (lon >= -125 && lon <= -60 && lat >= 25 && lat <= 49) return 2; // Continental USA
    if (lon >= -170 && lon <= -125 && lat >= 49 && lat <= 72) return 1; // Alaska
    if (lon >= -95 && lon <= -60 && lat >= 40 && lat <= 72) return 4; // Eastern Canada
  }
  
  // Europe zones (approximate)
  if (lat >= 35 && lat <= 72 && lon >= -10 && lon <= 40) {
    if (lon >= -10 && lon <= 20 && lat >= 35 && lat <= 55) return 27; // Western Europe
    if (lon >= 20 && lon <= 40 && lat >= 35 && lat <= 55) return 28; // Central/Eastern Europe
  }
  
  // Default: estimate from longitude
  const zoneLon = Math.floor((lon + 180) / 4);
  return Math.max(1, Math.min(90, zoneLon));
}
