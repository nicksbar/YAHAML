#!/bin/bash

# N3FJP Protocol Debugging Test Setup
# This script sets up and runs all components needed to debug N3FJP protocol communication
# Usage: ./scripts/n3fjp_test_setup.sh [mode]
# Modes: relay, server, analyze, full

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default config
CLIENT_PORT=${CLIENT_PORT:-2000}
SERVER_HOST=${SERVER_HOST:-localhost}
SERVER_PORT=${SERVER_PORT:-1000}
RELAY_LOGDIR="$PROJECT_ROOT/captures"

# Create captures directory if it doesn't exist
mkdir -p "$RELAY_LOGDIR"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Main commands
run_relay() {
    log_info "Starting MITM relay..."
    log_info "  Client connects to:    localhost:$CLIENT_PORT"
    log_info "  Relay forwards to:     $SERVER_HOST:$SERVER_PORT"
    log_info "  Logs saved to:         $RELAY_LOGDIR/"
    
    npm run build > /dev/null 2>&1
    npx ts-node scripts/n3fjp_mitm_relay.ts $CLIENT_PORT $SERVER_HOST $SERVER_PORT
}

run_server() {
    log_info "Starting N3FJP test server on port $SERVER_PORT..."
    
    if [ -f "scripts/n3fjp_server_stub.py" ]; then
        python3 scripts/n3fjp_server_stub.py
    else
        log_error "N3FJP server stub not found"
        return 1
    fi
}

analyze_logs() {
    # Find the most recent MITM log
    local latest_log=$(ls -t "$RELAY_LOGDIR"/n3fjp_mitm_*.json 2>/dev/null | head -1)
    
    if [ -z "$latest_log" ]; then
        log_error "No MITM log files found in $RELAY_LOGDIR"
        return 1
    fi
    
    log_info "Analyzing: $latest_log"
    echo ""
    npm run build > /dev/null 2>&1
    npx ts-node scripts/analyze_n3fjp_log.ts "$latest_log"
}

monitor_logs() {
    # Watch the most recent log file
    local log_file=$(ls -t "$RELAY_LOGDIR"/n3fjp_mitm_*.log 2>/dev/null | head -1)
    
    if [ -z "$log_file" ]; then
        log_warning "No log files found yet. Waiting for relay to start..."
        sleep 2
        monitor_logs
        return
    fi
    
    log_info "Monitoring: $log_file"
    tail -f "$log_file"
}

show_help() {
    cat <<EOF
${GREEN}N3FJP Protocol Debugging Test Setup${NC}

Usage: $0 [mode] [options]

Modes:
  relay         Start the MITM relay (client connects here)
  server        Start the N3FJP test server
  analyze       Analyze the most recent captured logs
  monitor       Watch relay logs in real-time
  full          Run full test setup (requires manual coordination in separate terminals)
  check         Check port availability
  help          Show this help message

Options:
  --client-port PORT      Port for clients to connect to (default: 2000)
  --server-host HOST      Server hostname/IP (default: localhost)
  --server-port PORT      Server port (default: 1000)

Examples:
  # Start relay on default ports
  $0 relay
  
  # Start relay on custom port, forward to remote server
  $0 relay --client-port 3000 --server-host 192.168.1.100 --server-port 1000
  
  # Check if ports are available
  $0 check
  
  # Analyze logs from previous session
  $0 analyze
  
  # Monitor logs in real-time
  $0 monitor
  
Full Debug Workflow (3 terminals):
  Terminal 1: $0 server
  Terminal 2: $0 relay
  Terminal 3: npm run dev:all
  
  Then analyze results:
  $0 analyze

EOF
}

show_status() {
    echo ""
    echo -e "${BLUE}=== Port Status ===${NC}"
    if check_port $CLIENT_PORT; then
        log_success "Client port $CLIENT_PORT is in use"
    else
        log_warning "Client port $CLIENT_PORT is available"
    fi
    
    if check_port $SERVER_PORT; then
        log_success "Server port $SERVER_PORT is in use"
    else
        log_warning "Server port $SERVER_PORT is available"
    fi
    
    echo ""
    echo -e "${BLUE}=== Captured Logs ===${NC}"
    if [ -d "$RELAY_LOGDIR" ] && [ "$(ls -A "$RELAY_LOGDIR"/n3fjp_mitm_* 2>/dev/null)" ]; then
        ls -lh "$RELAY_LOGDIR"/n3fjp_mitm_* 2>/dev/null | tail -5
    else
        log_warning "No captured logs found yet"
    fi
    
    echo ""
}

# Parse command line arguments
MODE=${1:-help}

# Parse options
while [[ $# -gt 1 ]]; do
    case $2 in
        --client-port)
            CLIENT_PORT=$3
            shift 2
            ;;
        --server-host)
            SERVER_HOST=$3
            shift 2
            ;;
        --server-port)
            SERVER_PORT=$3
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Execute mode
case $MODE in
    relay)
        run_relay
        ;;
    server)
        run_server
        ;;
    analyze)
        analyze_logs
        ;;
    monitor)
        monitor_logs
        ;;
    check)
        show_status
        ;;
    help)
        show_help
        ;;
    *)
        log_error "Unknown mode: $MODE"
        show_help
        exit 1
        ;;
esac
