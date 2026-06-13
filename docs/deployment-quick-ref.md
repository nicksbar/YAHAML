# YAHAML Deployment Quick Reference

## 🚀 Quick Start (Any Environment)

### 1. Clone & Configure
```bash
git clone <repo> /opt/yahaml && cd /opt/yahaml
cp .env.example .env
nano .env  # Edit configuration
```

### 2. Install & Build
```bash
npm ci --only=production
cd ui && npm ci --only=production && npm run build && cd ..
npx prisma generate
npx prisma migrate deploy
```

### 3. Start
```bash
# Option A: Direct
npm start

# Option B: PM2 (recommended for VPS)
npm install -g pm2
pm2 start npm --name "yahaml" -- start
pm2 save && pm2 startup

# Option C: Docker
docker-compose up -d
```

## 📋 Environment Variables

```bash
# Required
HOST=0.0.0.0              # Bind to all interfaces
PORT=3000                 # API port
RELAY_HOST=0.0.0.0        # N3FJP relay bind
RELAY_PORT=10000          # N3FJP relay port
UDP_HOST=0.0.0.0          # UDP listener bind
UDP_PORT=2237             # UDP listener port
DATABASE_URL="file:./yahaml.db"

# Optional
NODE_ENV=production       # Environment
VITE_API_URL=https://...  # Frontend API URL
UDP_TARGETS=host:port     # UDP forwarding
OAUTH_ENABLED=false       # Authentication
```

## 🔧 Port Requirements

| Port | Protocol | Service | Required |
|------|----------|---------|----------|
| 3000 | TCP | API/Web | Yes |
| 10000 | TCP | N3FJP Relay | Yes |
| 2237 | UDP | UDP Listener | Yes |

## 🐳 Docker Compose

```yaml
version: '3.8'
services:
  yahaml:
    build: .
    ports:
      - "3000:3000"
      - "10000:10000"
      - "2237:2237/udp"
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - DATABASE_URL=file:/data/yahaml.db
    volumes:
      - yahaml-data:/data
    restart: unless-stopped
volumes:
  yahaml-data:
```

## 🔒 Firewall (UFW)

```bash
sudo ufw allow 3000/tcp   # API
sudo ufw allow 10000/tcp  # Relay
sudo ufw allow 2237/udp   # UDP
sudo ufw enable
```

## 🌐 Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Add SSL
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📱 N3FJP Configuration

Point N3FJP to your server:
- **Host**: `your-server-ip` or `your-domain.com`
- **Port**: `10000`
- **Protocol**: TCP
- **Encoding**: UTF-16LE

## 🔍 Health Checks

```bash
# API health
curl http://your-server/health

# Services status
curl http://your-server/api/services

# PM2 status
pm2 status

# Docker status
docker-compose ps
```

## 🔄 Updates

```bash
# PM2 (zero downtime)
git pull
npm ci --only=production
cd ui && npm ci && npm run build && cd ..
npx prisma migrate deploy
pm2 reload yahaml

# Docker (brief downtime)
git pull
docker-compose up -d --build
```

## 💾 Backup

```bash
# Database
cp yahaml.db "backup-$(date +%Y%m%d).db"

# Docker volume
docker run --rm -v yahaml_yahaml-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/yahaml-backup.tar.gz /data
```

## 🐛 Troubleshooting

### Port in Use
```bash
sudo lsof -i :3000
sudo kill -9 <PID>
```

### Check Logs
```bash
# PM2
pm2 logs yahaml

# Docker
docker-compose logs -f
```

### Restart
```bash
# PM2
pm2 restart yahaml

# Docker
docker-compose restart
```

### Connection Issues
1. ✅ Verify HOST=0.0.0.0 in .env
2. ✅ Check firewall allows ports
3. ✅ Verify service running: `pm2 status` or `docker-compose ps`
4. ✅ Test locally: `curl http://localhost:3000/health`
5. ✅ Test remotely: `curl http://server-ip:3000/health`

## 🎯 Deployment Checklist

- [ ] Clone repository
- [ ] Configure .env file
- [ ] Install dependencies
- [ ] Build frontend
- [ ] Run database migrations
- [ ] Configure firewall
- [ ] Start application
- [ ] Verify health endpoint
- [ ] Configure N3FJP
- [ ] Set up SSL (production)
- [ ] Configure backup schedule
- [ ] Set up monitoring

## 📚 Full Documentation

See `deployment-complete.md` for the comprehensive deployment guide.

## 🆘 Quick Help

| Issue | Solution |
|-------|----------|
| Can't access remotely | Check HOST=0.0.0.0 and firewall |
| N3FJP won't connect | Verify RELAY_PORT and RELAY_HOST |
| Frontend blank | Check VITE_API_URL or proxy config |
| Database locked | Restart service |
| Port already used | Kill process or change port |
| SSL needed | Use nginx + certbot |

## 🌟 Recommended Production Setup

1. **VPS** (DigitalOcean, Linode, etc.)
2. **Ubuntu 22.04** or later
3. **Node.js 18+** via NodeSource
4. **PM2** for process management
5. **Nginx** for reverse proxy
6. **Let's Encrypt** for SSL
7. **UFW** for firewall
8. **PostgreSQL** for scaling (optional)

## 💡 Tips

- Use PM2 for automatic restarts
- Enable SSL for production
- Set up automated backups
- Monitor with PM2 or external service
- Use PostgreSQL for high volume
- Enable OAUTH when ready
- Keep dependencies updated
- Test updates in staging first

---

**Need Help?** Check logs first, then review `deployment-complete.md`
