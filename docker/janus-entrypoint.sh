#!/bin/bash
# Janus entrypoint script for Docker container
# Configures admin secret at runtime and starts Janus

set -e

# Allow admin secret to be set via environment or keep default
if [ -n "${JANUS_ADMIN_SECRET}" ]; then
  # Update admin secret in core config
  CONFIG_FILE="/opt/janus/etc/janus/janus.cfg.d/janus-yahaml.cfg"
  if [ -f "$CONFIG_FILE" ]; then
    sed "s/admin_secret = .*/admin_secret = \"${JANUS_ADMIN_SECRET}\"/" "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
    mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  fi
  
  # Also update in HTTP transport config
  HTTP_CONFIG="/opt/janus/etc/janus/janus.transport.http.jcfg"
  if [ -f "$HTTP_CONFIG" ]; then
    sed "s/^\s*#\?admin_secret = .*/\tadmin_secret = \"${JANUS_ADMIN_SECRET}\"/" "$HTTP_CONFIG" > "$HTTP_CONFIG.tmp"
    mv "$HTTP_CONFIG.tmp" "$HTTP_CONFIG"
    echo "[Entrypoint] Admin secret configured in HTTP transport"
  fi
  
  echo "[Entrypoint] Admin secret configured"
fi

# Log level from environment
if [ -n "${JANUS_DEBUG_LEVEL}" ]; then
  CONFIG_FILE="/opt/janus/etc/janus/janus.cfg.d/janus-yahaml.cfg"
  if [ -f "$CONFIG_FILE" ]; then
    sed "s/debug_level = .*/debug_level = ${JANUS_DEBUG_LEVEL}/" "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
    mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  fi
fi

# RTP port range (e.g. 20000-20039). Keep bounded for firewall/NAT predictability.
if [ -n "${JANUS_RTP_PORT_RANGE}" ]; then
  if echo "${JANUS_RTP_PORT_RANGE}" | grep -Eq '^[0-9]+-[0-9]+$'; then
    CONFIG_FILE="/opt/janus/etc/janus/janus.cfg.d/janus-yahaml.cfg"
    if [ -f "$CONFIG_FILE" ]; then
      sed "s/rtp_port_range = .*/rtp_port_range = \"${JANUS_RTP_PORT_RANGE}\"/" "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
      mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      echo "[Entrypoint] RTP port range configured: ${JANUS_RTP_PORT_RANGE}"
    fi
  else
    echo "[Entrypoint] Ignoring invalid JANUS_RTP_PORT_RANGE='${JANUS_RTP_PORT_RANGE}' (expected format MIN-MAX)"
  fi
fi

# Start Janus
echo "[Entrypoint] Starting Janus with args: $@"
exec /opt/janus/bin/janus "$@"
