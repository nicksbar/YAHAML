#!/bin/bash

API_BASE="http://localhost:3000/api"

echo "================================"
echo "YAHAML Radio/Hamlib API Testing"
echo "================================"
echo ""

# 1. Create a radio connection
echo "1. Creating radio connection..."
RADIO_RESPONSE=$(curl -s -X POST "$API_BASE/radios" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IC-7300 Station 1",
    "host": "192.168.1.100",
    "port": 4532,
    "pollInterval": 1000
  }')

RADIO_ID=$(echo $RADIO_RESPONSE | jq -r '.id')
echo "Radio created with ID: $RADIO_ID"
echo ""

# 2. List all radios
echo "2. Listing all radios..."
curl -s "$API_BASE/radios" | jq '.'
echo ""

# 3. Get single radio
echo "3. Getting radio details..."
curl -s "$API_BASE/radios/$RADIO_ID" | jq '.'
echo ""

# 4. Update radio (enable it)
echo "4. Enabling radio..."
curl -s -X PUT "$API_BASE/radios/$RADIO_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "isEnabled": true
  }' | jq '.'
echo ""

# 5. Create a station
echo "5. Creating station..."
STATION_RESPONSE=$(curl -s -X POST "$API_BASE/stations" \
  -H "Content-Type: application/json" \
  -d '{
    "callsign": "W1ABC"
  }')

STATION_ID=$(echo $STATION_RESPONSE | jq -r '.id')
echo "Station created with ID: $STATION_ID"
echo ""

# 6. Assign radio to station
echo "6. Assigning radio to station..."
ASSIGNMENT_RESPONSE=$(curl -s -X POST "$API_BASE/radio-assignments" \
  -H "Content-Type: application/json" \
  -d "{
    \"radioId\": \"$RADIO_ID\",
    \"stationId\": \"$STATION_ID\"
  }")

ASSIGNMENT_ID=$(echo $ASSIGNMENT_RESPONSE | jq -r '.id')
echo "Assignment created with ID: $ASSIGNMENT_ID"
echo $ASSIGNMENT_RESPONSE | jq '.'
echo ""

# 7. Get active assignments
echo "7. Getting active radio assignments..."
curl -s "$API_BASE/radio-assignments/active" | jq '.'
echo ""

# 8. Get station's current radio
echo "8. Getting station's assigned radio..."
curl -s "$API_BASE/stations/$STATION_ID/radio" | jq '.'
echo ""

# 9. Unassign radio
echo "9. Unassigning radio from station..."
curl -s -X POST "$API_BASE/radio-assignments/$ASSIGNMENT_ID/unassign" | jq '.'
echo ""

# 10. List all assignments (including inactive)
echo "10. Listing all radio assignments..."
curl -s "$API_BASE/radio-assignments" | jq '.'
echo ""

# 11. Clean up - delete radio
echo "11. Deleting radio connection..."
curl -s -X DELETE "$API_BASE/radios/$RADIO_ID" | jq '.'
echo ""

echo "================================"
echo "Test complete!"
echo "================================"
