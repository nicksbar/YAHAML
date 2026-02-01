#!/bin/bash
# Start N3FJP MITM relay for protocol debugging

# Default values
CLIENT_PORT=${1:-2000}
SERVER_HOST=${2:-localhost}
SERVER_PORT=${3:-1000}

echo "Starting N3FJP MITM Relay"
echo "========================"
echo "Client connects to: localhost:$CLIENT_PORT"
echo "Relay forwards to: $SERVER_HOST:$SERVER_PORT"
echo ""
echo "Run N3FJP server on port $SERVER_PORT"
echo "Run N3FJP client connecting to localhost:$CLIENT_PORT"
echo ""
echo "Logs saved to: captures/"
echo ""

npx ts-node scripts/n3fjp_mitm_relay.ts "$CLIENT_PORT" "$SERVER_HOST" "$SERVER_PORT"
