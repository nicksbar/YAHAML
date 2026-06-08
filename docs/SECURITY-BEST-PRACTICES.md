# YAHAML Security Best Practices

**Last Updated:** February 1, 2026

This document outlines security considerations and best practices for YAHAML.

---

## Table of Contents
- [Overview](#overview)
- [Authentication & Authorization](#authentication--authorization)
- [Input Validation](#input-validation)
- [Data Protection](#data-protection)
- [Network Security](#network-security)
- [Deployment Security](#deployment-security)
- [Monitoring & Logging](#monitoring--logging)
- [Incident Response](#incident-response)

---

## Overview

YAHAML is currently deployed without authentication, which is appropriate for its primary use case: trusted amateur radio operators in controlled environments. However, this document provides guidance for scenarios where enhanced security is needed.

**Current Security Posture:**
- ✅ No sensitive data in logs
- ✅ Environment variables for configuration
- ✅ Basic input validation
- ⚠️ No authentication (by design for current use case)
- ⚠️ No rate limiting
- ⚠️ No HTTPS enforcement

---

## Authentication & Authorization

### Current State
YAHAML assumes trusted operators in:
- Field day sites
- Contest venues
- Club operations
- Local deployments

**Use Cases for Authentication:**
- Remote access to deployed systems
- Public cloud deployment
- Multi-tenant environments
- Administrative functions

### Recommended Authentication Options

#### 1. JWT-Based Authentication

**Implementation:**
```typescript
// Add to src/index.ts or dedicated auth module
import jwt from 'jsonwebtoken';

// Generate token on login
const token = jwt.sign(
  { callsign, sessionId },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

// Verify token on API requests
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

**Configuration:**
```bash
# .env
JWT_SECRET=<strong-random-string>
JWT_EXPIRY=24h
```

**Considerations:**
- Token expiry: 24 hours recommended
- Refresh tokens for long sessions
- Implement token revocation

#### 2. OAuth Integration

**Supported Providers:**
- Google OAuth
- GitHub OAuth
- HamRadio-specific OAuth

**Implementation:**
```typescript
// Add OAuth middleware
import passport from 'passport';
import { GoogleStrategy } from 'passport-google-oauth20';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/callback'
}, (
  accessToken,
  refreshToken,
  profile,
  done
) => {
  // Create or find user
  done(null, profile);
}));
```

#### 3. Simple Password Authentication

**For Local Deployments:**
```typescript
// Basic auth middleware
import express from 'express';

app.use((req, res, next) => {
  const auth = req.get('Authorization');
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

---

## Input Validation

### Current State
Basic validation exists in some areas, but comprehensive validation is recommended.

### Recommended Validation Strategy

#### 1. Runtime Validation with Zod

**Install:**
```bash
npm install zod
```

**Example:**
```typescript
import { z } from 'zod';

// Define schema
const QSOValidationSchema = z.object({
  callsign: z.string().min(2).max(15),
  band: z.string().regex(/^[2-8]([0-9]|CM|M)$/),
  mode: z.string().regex(/^(CW|PH|DIG)$/),
  frequency: z.string().regex(/^[0-9]+$/),
  power: z.string().regex(/^[0-9]+$/),
});

// Validate input
const result = QSOValidationSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ error: result.error.errors });
}
```

#### 2. Sanitization

**For User Input:**
```typescript
import escape from 'escape-html';

// Sanitize HTML content
export function sanitizeHTML(input: string): string {
  return escape(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

#### 3. Rate Limiting

**Install:**
```bash
npm install express-rate-limit
```

**Configuration:**
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);
```

---

## Data Protection

### 1. Sensitive Data Handling

**Current:**
- Callsigns stored (public information)
- Locations stored (potentially sensitive)

**Recommendations:**
- Never log full callsigns in error messages
- Mask locations in logs
- Use environment variables for secrets

**Example:**
```typescript
// ❌ DON'T log sensitive data
console.error(`Error logging QSO from ${callsign} at ${location}`);

// ✅ DO mask sensitive data
console.error(`Error logging QSO from ${maskCallsign(callsign)}`);
```

### 2. Database Security

**Current:**
- SQLite/PostgreSQL
- Prisma ORM

**Recommendations:**
- Use parameterized queries exclusively
- Never use string concatenation for queries
- Encrypt sensitive database columns if needed

### 3. File Upload Security

**Current:**
- ADIF file imports

**Recommendations:**
- Validate file types
- Sanitize file content
- Check file size limits
- Store in isolated directory

```typescript
// Validate file upload
const file = req.file;
if (!file) return res.status(400).json({ error: 'No file uploaded' });

if (!['.adi', '.adif'].includes(file.originalname.toLowerCase())) {
  return res.status(400).json({ error: 'Invalid file type' });
}
```

---

## Network Security

### 1. HTTPS Enforcement

**For Production:**
```typescript
// Force HTTPS redirect
app.all('*', function(req, res, next) {
  if (req.get('X-Forwarded-Proto') !== 'https') {
    return res.redirect('https://' + req.get('Host') + req.url);
  }
  next();
});
```

### 2. CORS Configuration

**Current:**
- Basic CORS setup

**Recommendations:**
```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 3. WebSocket Security

**Current:**
- WebSocket proxy

**Recommendations:**
- Validate WebSocket origins
- Implement heartbeat to prevent zombies
- Use secure WebSocket (wss://)

```typescript
// Validate WebSocket origin
const origin = req.get('Origin');
const allowedOrigins = [process.env.ALLOWED_WEBSOCKET_ORIGINS];

if (!allowedOrigins.includes(origin)) {
  return next(); // Reject connection
}
```

---

## Deployment Security

### 1. Environment Variables

**Required:**
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/yahaml

# JWT (if enabled)
JWT_SECRET=<strong-random-string-32-chars>
JWT_EXPIRY=24h

# API
API_SECRET=<strong-random-string>

# CORS
ALLOWED_ORIGINS=http://localhost:5173
```

**Security Checklist:**
- [ ] No hardcoded secrets in code
- [ ] .env file in .gitignore
- [ ] Use strong random secrets
- [ ] Rotate secrets regularly
- [ ] Use secrets management in production

### 2. Container Security

**Docker:**
```dockerfile
FROM node:18-alpine

# Non-root user
RUN addgroup -g 1000 -S nodejs && \
    adduser -S nodejs -u 1000

USER nodejs

# Run as non-root
CMD ["node", "dist/index.js"]
```

**Security Checklist:**
- [ ] Run as non-root user
- [ ] Use minimal base image
- [ ] Scan for vulnerabilities
- [ ] Keep dependencies updated
- [ ] Use secret management for credentials

### 3. Firewall Configuration

**Recommended Ports:**
- `3000` - API (HTTP/HTTPS)
- `5173` - Frontend (development only)
- `10001` - N3FJP relay (if enabled)
- `2237` - UDP listener (if enabled)

**Block:**
- All other ports
- Development ports in production

---

## Monitoring & Logging

### 1. Security Event Logging

**Track:**
- Failed authentication attempts
- Rate limit triggers
- Suspicious API usage
- Unusual access patterns

```typescript
// Log security events
function logSecurityEvent(event: string, details: any) {
  console.log(`[SECURITY] ${event}`, JSON.stringify(details));
}
```

### 2. Audit Logging

**Current:**
- AuditLog model exists

**Recommendations:**
- Log all authentication events
- Log configuration changes
- Log access to sensitive data
- Retain logs for compliance

### 3. Monitoring Tools

**Recommended:**
- Prometheus + Grafana for metrics
- ELK stack for logs
- Health check endpoints
- Alerting rules

---

## Incident Response

### 1. Security Incident Types

**Categories:**
- Unauthorized access attempts
- Data breach
- Service disruption
- Vulnerability exploitation

### 2. Response Checklist

**Immediate Actions:**
- [ ] Assess scope of incident
- [ ] Document timeline
- [ ] Preserve evidence
- [ ] Contain if possible
- [ ] Notify stakeholders
- [ ] Implement remediation

### 3. Recovery Procedures

**After Incident:**
- [ ] Restore from clean backup
- [ ] Verify system integrity
- [ ] Update security measures
- [ ] Document lessons learned
- [ ] Update incident response plan

---

## Security Testing

### 1. Vulnerability Scanning

**Tools:**
- `npm audit` - Dependency vulnerabilities
- `snyk test` - Security scanning
- `trivy` - Container scanning

### 2. Penetration Testing

**Recommended Tests:**
- SQL injection
- XSS attacks
- CSRF attempts
- Rate limit bypass
- Authentication bypass

### 3. Security Audits

**Schedule:**
- Quarterly code review
- Monthly dependency check
- Annual penetration test
- Continuous monitoring

---

## Compliance Considerations

### 1. Amateur Radio Regulations

**Compliance:**
- Callsign validation
- Location accuracy
- Contest rules adherence
- Logging requirements

### 2. Data Privacy

**Considerations:**
- User data minimization
- Data retention policies
- User consent (if applicable)
- Right to deletion

---

## Future Enhancements

### Planned Security Features
1. [ ] Two-factor authentication
2. [ ] IP whitelisting
3. [ ] Session management improvements
4. [ ] Advanced logging and monitoring
5. [ ] Security dashboard
6. [ ] Automated vulnerability scanning

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CISA Security Resources](https://www.cisa.gov/resources-tools)
- [Ham Radio Security Practices](https://www.arrl.org/security)

---

**Last Updated:** February 1, 2026  
**Next Review:** Quarterly or after major security incidents