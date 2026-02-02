# YAHAML Deployment Guide

This guide covers deploying YAHAML to production environments.

## Environment Configuration

YAHAML uses environment variables for configuration. Copy `.env.example` to `.env` and configure:

### Required Variables

```bash
# Database
DATABASE_URL="file:./yahaml.db"

# Server Configuration
NODE_ENV="production"
PORT=3000
HOST=0.0.0.0  # Bind to all interfaces

# Relay Server Configuration
RELAY_PORT=10001
RELAY_HOST=0.0.0.0  # Bind to all interfaces

# UDP Listener Configuration
UDP_PORT=2237
UDP_HOST=0.0.0.0  # Bind to all interfaces
UDP_TARGETS=  # Optional: Forward UDP to other hosts (host:port,host:port)

# Authentication
OAUTH_ENABLED=false  # Set to true when OAuth is configured

# Frontend (Production)
VITE_API_URL=https://your-api-domain.com  # Your production API URL
```

## Deployment Options

### Option 1: Docker (Recommended)

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY ui/package*.json ./ui/

# Install dependencies
RUN npm ci --only=production
RUN cd ui && npm ci --only=production

# Copy application files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build frontend
RUN cd ui && npm run build

# Expose ports
EXPOSE 3000 10001 2237/udp

# Start application
CMD ["npm", "start"]
```

#### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  yahaml:
    build: .
    ports:
      - "3000:3000"    # API/Web
      - "10001:10001"  # N3FJP Relay
      - "2237:2237/udp" # UDP Listener
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3000
      - RELAY_PORT=10001
      - RELAY_HOST=0.0.0.0
      - UDP_PORT=2237
      - UDP_HOST=0.0.0.0
      - DATABASE_URL=file:/data/yahaml.db
    volumes:
      - yahaml-data:/data
    restart: unless-stopped

volumes:
  yahaml-data:
```

#### 3. Deploy

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 2: VPS/Cloud Server

#### 1. Prerequisites

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2
```

#### 2. Deploy Application

```bash
# Clone repository
git clone <your-repo> /opt/yahaml
cd /opt/yahaml

# Install dependencies
npm ci --only=production
cd ui && npm ci --only=production && cd ..

# Configure environment
cp .env.example .env
nano .env  # Edit configuration

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Build frontend
cd ui && npm run build && cd ..

# Start with PM2
pm2 start npm --name "yahaml" -- start
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

#### 3. Configure Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # API and backend
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Frontend (if serving from same domain)
    location / {
        root /opt/yahaml/ui/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

#### 4. SSL with Let's Encrypt

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Option 3: Cloud Platform (Heroku, Railway, Render)

#### 1. Add Procfile

```
web: npm start
```

#### 2. Configure Build

Most platforms auto-detect Node.js. Ensure these scripts in `package.json`:

```json
{
  "scripts": {
    "build": "cd ui && npm install && npm run build && cd .. && npx prisma generate",
    "start": "node dist/index.js"
  }
}
```

#### 3. Environment Variables

Set in platform dashboard:
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT` (usually auto-set by platform)
- `DATABASE_URL` (use platform database or volume)
- `RELAY_PORT=10001`
- `UDP_PORT=2237`

## Network Configuration

### Firewall Rules

Open required ports:

```bash
# API/Web
sudo ufw allow 3000/tcp

# N3FJP Relay
sudo ufw allow 10001/tcp

# UDP Listener
sudo ufw allow 2237/udp
```

### Port Forwarding

If deploying behind NAT, forward:
- TCP 3000 → API server
- TCP 10001 → N3FJP relay
- UDP 2237 → UDP listener

### N3FJP Configuration

Point N3FJP to your deployment:
- **Host**: `your-domain.com` or IP address
- **Port**: `10001`
- **Protocol**: TCP
- **Encoding**: UTF-16LE

## Database Management

### Backup

```bash
# SQLite backup
cp yahaml.db yahaml.db.backup

# Or with timestamp
cp yahaml.db "yahaml.db.$(date +%Y%m%d_%H%M%S).backup"
```

### Restore

```bash
cp yahaml.db.backup yahaml.db
pm2 restart yahaml  # or docker-compose restart
```

### Migrations

```bash
# Run pending migrations
npx prisma migrate deploy

# Check migration status
npx prisma migrate status
```

## Monitoring

### PM2 Monitoring

```bash
# View status
pm2 status

# View logs
pm2 logs yahaml

# Monitor resources
pm2 monit

# Restart
pm2 restart yahaml
```

### Docker Monitoring

```bash
# Container status
docker-compose ps

# Resource usage
docker stats yahaml_yahaml_1

# Logs
docker-compose logs -f --tail=100
```

### Health Check

```bash
# API health
curl http://your-domain.com/health

# Services status
curl http://your-domain.com/api/services
```

## Performance Tuning

### Database Optimization

For high-volume deployments, consider PostgreSQL:

```bash
# Install PostgreSQL
sudo apt-get install postgresql

# Update DATABASE_URL
DATABASE_URL="postgresql://user:password@localhost:5432/yahaml"

# Migrate
npx prisma migrate deploy
```

### Node.js Clustering

Modify startup to use all CPU cores:

```javascript
// cluster.js
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
  const cpus = os.cpus().length;
  for (let i = 0; i < cpus; i++) {
    cluster.fork();
  }
} else {
  require('./dist/index.js');
}
```

Start with: `pm2 start cluster.js -i max`

## Security

### Environment Variables

Never commit `.env` files. Use secrets management:

```bash
# GitHub Secrets
# AWS Secrets Manager
# Docker Secrets
# Kubernetes Secrets
```

### HTTPS

Always use HTTPS in production:
- Use Let's Encrypt (free)
- Use cloud platform SSL
- Use Cloudflare proxy

### Authentication

Enable OAuth when ready:

```bash
OAUTH_ENABLED=true
# Add OAuth provider configuration
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
sudo lsof -i :3000
sudo kill -9 <PID>
```

### Database Locked

```bash
# Check connections
sudo lsof | grep yahaml.db

# Restart application
pm2 restart yahaml
```

### Connection Refused

1. Check firewall rules
2. Verify HOST=0.0.0.0 (not 127.0.0.1)
3. Check service status: `pm2 status` or `docker-compose ps`
4. Review logs for errors

### High Memory Usage

```bash
# Check Node.js memory
NODE_OPTIONS="--max-old-space-size=2048" npm start

# Or in PM2
pm2 start npm --name "yahaml" --node-args="--max-old-space-size=2048" -- start
```

## Scaling

### Horizontal Scaling

For multiple instances:
1. Use external PostgreSQL database
2. Use Redis for session storage
3. Use load balancer (nginx, HAProxy)
4. Deploy multiple containers/instances

### Load Balancing

```nginx
upstream yahaml_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    location /api {
        proxy_pass http://yahaml_backend;
    }
}
```

## Updates

### Rolling Update (Zero Downtime)

```bash
# Pull latest code
git pull

# Install dependencies
npm ci --only=production

# Build
cd ui && npm run build && cd ..

# Migrate database
npx prisma migrate deploy

# Reload PM2 (zero downtime)
pm2 reload yahaml

# Or Docker (brief downtime)
docker-compose pull
docker-compose up -d
```

## Support

For issues or questions:
- Check logs: `pm2 logs yahaml` or `docker-compose logs`
- Review `/api/services` endpoint
- Check database connectivity
- Verify environment variables
- Review firewall/network configuration
