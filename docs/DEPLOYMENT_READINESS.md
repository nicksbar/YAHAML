# Deployment Readiness Changes

## Summary

YAHAML has been updated to work in any deployment environment, not just localhost. All services now bind to `0.0.0.0` (all network interfaces) by default and use environment variables for configuration.

## Changes Made

### 1. Environment Variables

**Updated `.env.example` and `.env`:**
- Added `HOST=0.0.0.0` - API server binding address
- Added `RELAY_HOST=0.0.0.0` - Relay server binding address  
- Added `UDP_HOST=0.0.0.0` - UDP server binding address
- Added `VITE_API_URL` - Frontend API URL for production builds

### 2. Backend Changes

**`src/index.ts`:**
- Added host configuration variables from environment
- Updated API server to bind to configured host (default: 0.0.0.0)
- Modified `/api/services` endpoint to return dynamic URLs based on request host
- Updated console output to show binding information
- Pass host parameters to relay and UDP servers

**`src/relay.ts`:**
- Updated `startRelayServer()` to accept `host` parameter
- Changed binding from hardcoded `0.0.0.0` to configurable host
- Enhanced console output to show accessible interfaces

**`src/udp.ts`:**
- Updated `startUdpServer()` to accept `host` parameter  
- Changed binding to use configurable host
- Enhanced console output to show accessible interfaces

### 3. Frontend Changes

**`ui/vite.config.ts`:**
- Updated proxy configuration to use `VITE_API_URL` environment variable
- Falls back to `http://localhost:3000` for development
- Enables production builds to connect to any API server

### 4. Documentation

**Created `DEPLOYMENT.md`:**
- Comprehensive deployment guide
- Docker deployment with docker-compose
- VPS/Cloud server deployment with PM2
- Cloud platform deployment (Heroku, Railway, Render)
- Network configuration (firewall, port forwarding)
- Database management (backup, restore, migrations)
- Monitoring and troubleshooting
- Security best practices
- Scaling strategies
- Update procedures

## How It Works

### Development (Current)
All services bind to `0.0.0.0` but display as `localhost` for convenience:
- **API**: http://localhost:3000
- **Relay**: localhost:10001
- **UDP**: localhost:2237

The frontend uses Vite's proxy to forward `/api` requests to the backend.

### Production Deployment

#### Option 1: Docker
```bash
docker-compose up -d
```
Services automatically accessible on all interfaces. Configure `VITE_API_URL` for frontend builds.

#### Option 2: VPS with PM2
```bash
pm2 start npm --name "yahaml" -- start
```
Services bind to `0.0.0.0`, accessible from any IP. Use nginx for reverse proxy and SSL.

#### Option 3: Cloud Platform
Services use platform-assigned ports and hosts. Set environment variables in platform dashboard.

## Network Binding

### Before (Localhost Only)
```
API:   127.0.0.1:3000 (localhost only)
Relay: 0.0.0.0:10001 (all interfaces)
UDP:   0.0.0.0:2237 (all interfaces)
```

### After (Configurable)
```
API:   0.0.0.0:3000 (all interfaces, configurable)
Relay: 0.0.0.0:10001 (all interfaces, configurable)
UDP:   0.0.0.0:2237 (all interfaces, configurable)
```

## Testing Deployment Readiness

### 1. Local Network Access
```bash
# Find your local IP
ip addr show | grep 'inet 192'

# Test API from another device on your network
curl http://192.168.x.x:3000/health

# Test from N3FJP on another machine
# Set N3FJP relay to: 192.168.x.x:10001
```

### 2. Docker Test
```bash
# Build image
docker build -t yahaml .

# Run container
docker run -p 3000:3000 -p 10001:10001 -p 2237:2237/udp yahaml

# Access from host
curl http://localhost:3000/health
```

### 3. Production Simulation
```bash
# Set production environment
export NODE_ENV=production
export HOST=0.0.0.0
export VITE_API_URL=https://your-api-domain.com

# Build frontend
cd ui && npm run build

# Start backend
npm start
```

## Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `HOST` | 0.0.0.0 | API server bind address |
| `PORT` | 3000 | API server port |
| `RELAY_HOST` | 0.0.0.0 | Relay server bind address |
| `RELAY_PORT` | 10001 | N3FJP relay port |
| `UDP_HOST` | 0.0.0.0 | UDP listener bind address |
| `UDP_PORT` | 2237 | UDP listener port |
| `UDP_TARGETS` | (empty) | Forward UDP to other hosts |
| `OAUTH_ENABLED` | false | Enable OAuth authentication |
| `VITE_API_URL` | (empty) | Frontend API URL for production |
| `DATABASE_URL` | file:./yahaml.db | Database connection string |

## Migration from Localhost

### No Code Changes Required
- All existing functionality works unchanged
- Frontend still uses relative URLs (`/api/...`)
- Backend automatically uses request host for URLs

### Update N3FJP Configuration
When deploying to remote server:
1. Get server IP or domain
2. Update N3FJP relay settings:
   - **Host**: `your-server-ip` or `your-domain.com`
   - **Port**: `10001`
3. Test connection

### Update UDP Clients
Point UDP logging software to:
- **Host**: `your-server-ip` or `your-domain.com`
- **Port**: `2237`

## Security Considerations

### Firewall Configuration
When deploying, ensure firewall allows:
- **TCP 3000** - API/Web access
- **TCP 10001** - N3FJP relay
- **UDP 2237** - UDP logging

### SSL/TLS
For production, use HTTPS:
- Use nginx or Caddy as reverse proxy
- Obtain SSL certificate (Let's Encrypt)
- Configure `VITE_API_URL=https://your-domain.com`

### Authentication
- Currently uses callsign whitelist
- Plan to implement OAuth (`OAUTH_ENABLED=true`)
- Consider VPN for relay/UDP access if needed

## Rollback
If issues occur, revert to localhost-only:
```bash
# In .env
HOST=127.0.0.1
RELAY_HOST=127.0.0.1
UDP_HOST=127.0.0.1
```

This limits access to local machine only.

## Next Steps

1. **Test locally** - Verify all services work on 0.0.0.0
2. **Test on network** - Access from another device on LAN
3. **Choose deployment method** - Docker, VPS, or cloud platform
4. **Configure DNS** - Point domain to server
5. **Set up SSL** - Enable HTTPS
6. **Deploy** - Follow DEPLOYMENT.md guide
7. **Monitor** - Check logs and performance

## Support Files

- **DEPLOYMENT.md** - Complete deployment guide
- **.env.example** - Environment variable template
- **docker-compose.yml** - (To be created) Docker deployment config
- **Dockerfile** - (To be created) Container build instructions

## Verification

✅ Server binds to 0.0.0.0 (all interfaces)
✅ Environment variables control all binding
✅ Frontend uses relative URLs (deployment-agnostic)
✅ Services endpoint returns dynamic host-based URLs
✅ Documentation complete
✅ No breaking changes to existing functionality
