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

From `docker-compose.yml` **and** `docker-compose.postgres.yml`, publish these for full support:

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

Important Portainer note:

- Portainer showing `HOST:CONTAINER` ports means the port is **published by Docker**.
- It does **not** guarantee a process is listening inside the container.
- Verify listener/protocol with direct probes (e.g., Janus `POST /janus` on `8088`, WebSocket upgrade on `8188`).

> The default `20000-20039` range is sized for about 10 concurrent sessions with headroom.
> If your load is higher, increase the range and mirror that in firewall/NAT rules.

## Compose and env controls

Set these in your `.env` (or Portainer stack env):

- `JANUS_API_PORT` (default `8088`)
- `JANUS_WS_PORT` (default `8188`)
- `JANUS_ADMIN_PORT` (default `7088`)
- `JANUS_RTP_PORT_RANGE` (default `20000-20039`)

Janus transport requirements:

- HTTP API transport is configured via `docker/janus.transport.http.jcfg` on `8088`.
- WebSocket transport is configured via `docker/janus.transport.websockets.jcfg` on `8188`.
- The Janus image must include websocket support at build time (libwebsockets available during configure/build).

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

## Option C — HTTPS-only Janus signaling via custom locations (no Streams)

If NPM Streams are unreliable in your environment, terminate TLS at NPM and route Janus API/WebSocket over the same HTTPS host using custom locations.

Example for host `yahaml.example.com`:

- `/` → UI/API upstream (existing YAHAML app)
- `/janus` → Janus HTTP API upstream (`http://<janus-container-or-host>:8088/janus`)
- `/janus-ws` → Janus WebSocket upstream (`http://<janus-container-or-host>:8188`) with WS upgrade headers

Important clarification for API/admin routes:

- If your NPM Proxy Host points to the **UI service** (`ui:80` / host `:8080`), YAHAML’s bundled UI nginx already handles:
	- `/api/*` → API container
	- `/ws` → API WebSocket
	- `/admin` → SPA route (UI page)
- In that setup, you do **not** need separate NPM custom locations for `/api`, `/api/admin`, or `/ws`.
- You only add explicit NPM custom locations for `/api` and `/ws` if your Proxy Host upstream is **not** the UI service.

Recommended custom location entries:

1. `location /janus` → Forward Hostname/IP: Janus target, Forward Port: `8088`, scheme `http`
2. `location /janus-ws` → Forward Hostname/IP: Janus target, Forward Port: `8188`, scheme `http`, WebSocket support enabled

Optional (only when bypassing UI service as upstream):

3. `location /api` → Forward Hostname/IP: API target, Forward Port: `3000`, scheme `http`
4. `location /ws` → Forward Hostname/IP: API target, Forward Port: `3000`, scheme `http`, WebSocket support enabled

Operational notes:

- Ensure `/janus` and `/janus-ws` are handled before generic SPA fallback routing.
- Keep NPM upstream scheme as `http` for Janus locations unless you explicitly enable Janus-native TLS (`8089/8189`).
- Keep Janus media (`20000-20039/udp`) directly exposed via firewall/NAT (not through HTTP proxy).
- In YAHAML Admin → Client Routing Overrides:
	- **Browser Janus API Override**: `https://yahaml.example.com/janus`
	- **Janus Host Override**: leave empty when using Browser Janus API Override
	- **WebSocket Host Override**: optional; typically leave empty unless explicitly needed
	- **API Host Override**: optional; normally leave empty when `/api` is already proxied by UI nginx

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
3. Janus API works via proxy: `POST https://yahaml.example.com/janus` with `{ "janus": "info" }` returns `server_info`
4. Janus WebSocket upgrades succeed on `https://yahaml.example.com/janus-ws`
5. `GET /api/admin/janus/rooms` returns expected room state
6. Remote audio publisher can reach Janus URL and RTP works (both directions)
7. TCP relay and UDP ingest are reachable from intended clients
