# Portainer + Nginx Proxy Manager Deployment Guide

This guide covers a practical production-style deployment for YAHAML with:

- Docker/Portainer managed containers
- Nginx Proxy Manager (NPM) for HTTPS and host routing
- bounded Janus RTP UDP range for predictable firewalling

## Goals

1. Keep web traffic simple (`https://yahaml.example.com`)
2. Keep non-HTTP protocols explicit and predictable by port
3. Keep Janus media in a bounded range for security and operations

## Required published ports

From `docker-compose.yml`, publish these for full support:

### Web / signaling

- `8080/tcp` (UI container; often proxied by NPM host)
- `3000/tcp` (API; can be internal-only if NPM points directly to API container)
- `8088/tcp` (Janus HTTP API)
- `8188/tcp` (Janus WebSocket signaling)
- `7088/tcp` (Janus admin API; ideally restricted/internal)

### Radio and ingest protocols

- `10000/tcp` (YAHAML relay)
- `2237/udp` (UDP listener)

### Janus media

- `20000-20039/udp` (default bounded Janus RTP range)

> The default `20000-20039` range is sized for about 10 concurrent sessions with headroom.
> If your load is higher, increase the range and mirror that in firewall/NAT rules.

## Compose and env controls

Set these in your `.env` (or Portainer stack env):

- `JANUS_API_PORT` (default `8088`)
- `JANUS_WS_PORT` (default `8188`)
- `JANUS_ADMIN_PORT` (default `7088`)
- `JANUS_RTP_PORT_RANGE` (default `20000-20039`)

`JANUS_RTP_PORT_RANGE` is used in two places:

1. Host publish mapping in `docker-compose.yml`
2. Janus runtime config (`rtp_port_range`) via container entrypoint

This keeps Janus allocation and exposed ports aligned.

## Nginx Proxy Manager setup

## Option A — Recommended (single web hostname + explicit protocol ports)

Use one public hostname for browser traffic:

- `yahaml.example.com` → NPM Proxy Host → UI/API paths and WebSocket

Use direct port access for non-HTTP protocols:

- `yahaml.example.com:10000` (relay TCP)
- `yahaml.example.com:2237/udp` (UDP ingest)
- `yahaml.example.com:8188` (Janus WS if clients use it directly)

For Janus RTP (`20000-20039/udp`), expose directly on firewall/NAT.

## Option B — NPM Streams for TCP/UDP services

If your NPM build supports Streams:

- configure stream entries for `10000/tcp` and optionally `2237/udp`
- still keep Janus RTP range open as UDP pass-through

Remember: stream routing is by port, not by HTTP host headers.

## Host override settings in YAHAML

YAHAML supports these browser-side overrides:

- global host override
- Janus host override
- API host override
- WebSocket host override

Guidance:

- Prefer host or `host:port` values for overrides.
- If you provide full URL values, YAHAML normalizes ports/protocols and avoids malformed endpoint strings.
- For remote provisioning, use a Pi-reachable `YAHAML Janus URL` explicitly when needed.

## Security recommendations

1. Keep `7088` (Janus admin) restricted to trusted networks.
2. Expose only ports you need.
3. Use a bounded RTP range and firewall only that range.
4. Keep admin secrets out of logs and repo files.

## Troubleshooting quick checks

1. Browser UI works at `https://yahaml.example.com`
2. WebSocket upgrades succeed (`/ws`)
3. `GET /api/admin/janus/rooms` returns expected room state
4. Remote audio publisher can reach Janus URL and RTP works (both directions)
5. TCP relay and UDP ingest are reachable from intended clients
