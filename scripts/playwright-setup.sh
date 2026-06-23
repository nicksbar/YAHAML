#!/bin/bash
# Playwright test setup script
# Starts docker-compose services, waits for health, then runs tests
# Usage: ./scripts/playwright-setup.sh [test-args]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[Playwright Setup]${NC} Starting docker-compose services..."

# Start docker-compose
docker-compose up -d --build 2>&1 | grep -E "(Creating|Running|Removing|Recreate)" || true

echo -e "${YELLOW}[Playwright Setup]${NC} Waiting for services to be healthy..."

# Wait for Janus to be healthy (max 60 seconds)
RETRY_COUNT=0
MAX_RETRIES=30
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker-compose ps janus | grep -q "healthy"; then
    echo -e "${GREEN}[Playwright Setup]${NC} Janus is healthy"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}[Playwright Setup]${NC} Janus failed to become healthy"
    docker-compose logs janus | tail -20
    exit 1
  fi
  sleep 2
done

# Wait for API to respond (max 60 seconds)
RETRY_COUNT=0
MAX_RETRIES=30
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -fsS http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}[Playwright Setup]${NC} API is responsive"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}[Playwright Setup]${NC} API failed to respond"
    docker-compose logs api | tail -20
    exit 1
  fi
  sleep 2
done

# Wait for UI to respond (max 60 seconds)
RETRY_COUNT=0
MAX_RETRIES=30
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -fsS http://localhost:8080 > /dev/null 2>&1; then
    echo -e "${GREEN}[Playwright Setup]${NC} UI is responsive"
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}[Playwright Setup]${NC} UI failed to respond"
    docker-compose logs ui | tail -20
    exit 1
  fi
  sleep 2
done

echo -e "${GREEN}[Playwright Setup]${NC} All services ready, running Playwright tests..."
echo ""

# Run Playwright tests with existing server
export PLAYWRIGHT_USE_EXISTING_SERVER=true
npm run test:browser:ci -- "$@"
TEST_RESULT=$?

echo ""
echo -e "${YELLOW}[Playwright Setup]${NC} Cleaning up docker-compose services..."
docker-compose down 2>&1 | grep -E "(Removing|Stopped)" || true

if [ $TEST_RESULT -eq 0 ]; then
  echo -e "${GREEN}[Playwright Setup]${NC} Tests passed"
else
  echo -e "${RED}[Playwright Setup]${NC} Tests failed with exit code $TEST_RESULT"
fi

exit $TEST_RESULT
