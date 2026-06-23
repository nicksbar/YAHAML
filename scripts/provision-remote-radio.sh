#!/usr/bin/env bash

set -euo pipefail

yn_to_bool() {
  local input="${1:-}"
  case "${input,,}" in
    y|yes|true|1) echo "true" ;;
    *) echo "false" ;;
  esac
}

prompt() {
  local var_name="$1"
  local text="$2"
  local default_value="${3:-}"
  local is_secret="${4:-false}"
  local value

  if [[ -n "$default_value" ]]; then
    if [[ "$is_secret" == "true" ]]; then
      read -r -s -p "$text [default hidden]: " value
      echo
    else
      read -r -p "$text [$default_value]: " value
    fi
    value="${value:-$default_value}"
  else
    if [[ "$is_secret" == "true" ]]; then
      read -r -s -p "$text: " value
      echo
    else
      read -r -p "$text: " value
    fi
  fi

  printf -v "$var_name" '%s' "$value"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found in PATH." >&2
    exit 1
  fi
}

require_cmd curl
require_cmd python3

echo "== YAHAML Remote Radio Provisioning =="
echo "This runs the SAME provisioning flow as the app admin UI via:"
echo "  POST /api/radios/:id/provision-remote-stream"
echo

prompt API_BASE "YAHAML API base URL" "http://localhost:3000"
prompt ADMIN_TOKEN "Admin bearer token (no 'Bearer ' prefix)" "" true
prompt RADIO_ID "Radio ID to provision"
prompt REMOTE_HOST "Remote host/IP"
prompt REMOTE_PORT "SSH port" "22"
prompt REMOTE_USER "SSH username"
prompt REMOTE_PASSWORD "SSH password" "" true
prompt SUDO_PASSWORD "Sudo password (optional; press Enter to skip)" "" true

prompt INSTALL_RIGCTL_RAW "Install rigctl dependencies? (y/n)" "y"
prompt INSTALL_AUDIO_RAW "Install audio publisher service? (y/n)" "y"
prompt GRANT_SCOPED_SUDO_RAW "Grant scoped sudo policy? (y/n)" "y"

prompt RIG_MODEL "Rig model ID (optional)"
prompt RIG_DEVICE "Rig device path, e.g. /dev/ttyUSB0 (optional)"
prompt RIG_BAUD "Rig baud (optional)" "115200"
prompt AUDIO_CAPTURE "Audio capture device, e.g. hw:2,0 (optional)"
prompt AUDIO_PLAYBACK "Audio playback device, e.g. hw:2,0 (optional)"
prompt JANUS_URL "Janus URL reachable from remote host (optional)"
prompt JANUS_ROOM_ID "Janus room ID (optional)"

if [[ -z "$API_BASE" || -z "$ADMIN_TOKEN" || -z "$RADIO_ID" || -z "$REMOTE_HOST" || -z "$REMOTE_USER" || -z "$REMOTE_PASSWORD" ]]; then
  echo "Error: API base URL, token, radio ID, remote host, SSH user, and SSH password are required." >&2
  exit 1
fi

INSTALL_RIGCTL="$(yn_to_bool "$INSTALL_RIGCTL_RAW")"
INSTALL_AUDIO="$(yn_to_bool "$INSTALL_AUDIO_RAW")"
GRANT_SCOPED_SUDO="$(yn_to_bool "$GRANT_SCOPED_SUDO_RAW")"

JSON_PAYLOAD="$(python3 - << 'PY' \
"$REMOTE_HOST" "$REMOTE_PORT" "$REMOTE_USER" "$REMOTE_PASSWORD" "$SUDO_PASSWORD" \
"$INSTALL_RIGCTL" "$INSTALL_AUDIO" "$GRANT_SCOPED_SUDO" \
"$RIG_MODEL" "$RIG_DEVICE" "$RIG_BAUD" "$AUDIO_CAPTURE" "$AUDIO_PLAYBACK" "$JANUS_URL" "$JANUS_ROOM_ID"
import json
import sys

(
  host, port, username, password, sudo_password,
  install_rigctl, install_audio, grant_scoped,
  rig_model, rig_device, rig_baud, audio_capture, audio_playback, janus_url, janus_room_id
) = sys.argv[1:]

payload = {
  "host": host,
  "port": int(port),
  "username": username,
  "password": password,
  "installRigctl": install_rigctl == "true",
  "installAudioPublisher": install_audio == "true",
  "installJanus": install_audio == "true",
  "grantScopedSudo": grant_scoped == "true",
}

if sudo_password:
  payload["sudoPassword"] = sudo_password

if rig_model.strip():
  payload["rigModel"] = int(rig_model)
if rig_device.strip():
  payload["rigDevice"] = rig_device
if rig_baud.strip():
  payload["rigBaud"] = int(rig_baud)
if audio_capture.strip():
  payload["audioCaptureDevice"] = audio_capture
if audio_playback.strip():
  payload["audioPlaybackDevice"] = audio_playback
if janus_url.strip():
  payload["yahamlJanusUrl"] = janus_url
if janus_room_id.strip():
  payload["janusRoomId"] = janus_room_id

print(json.dumps(payload))
PY
)"

echo
echo "== Starting provisioning stream =="
echo "Endpoint: ${API_BASE%/}/api/radios/${RADIO_ID}/provision-remote-stream"
echo

curl -sS -N \
  -X POST "${API_BASE%/}/api/radios/${RADIO_ID}/provision-remote-stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  --data "$JSON_PAYLOAD" | python3 - << 'PY'
import json
import sys

for raw in sys.stdin:
  line = raw.strip()
  if not line:
    continue
  try:
    event = json.loads(line)
  except Exception:
    print(line)
    continue

  t = event.get("type")
  if t == "status":
    print(f"[status] {event.get('message', '')}")
  elif t == "log":
    print(f"[log] {event.get('line', '')}")
  elif t == "warning":
    print(f"[warning] {event.get('line', '')}")
  elif t == "error":
    print(f"[error] {event.get('error', 'Unknown provisioning error')}")
    for warning in event.get("warnings", []) or []:
      print(f"[warning] {warning}")
    for log in event.get("logs", []) or []:
      print(f"[log] {log}")
  elif t == "done":
    print("[done] Provisioning complete")
    print(f"[done] scopedSudoGranted={event.get('scopedSudoGranted', False)}")
    ssh = event.get("ssh") or {}
    if ssh:
      print(f"[done] ssh={ssh.get('user')}@{ssh.get('host')}:{ssh.get('port')}")
      if ssh.get("privateKeyPath"):
        print(f"[done] privateKeyPath={ssh.get('privateKeyPath')}")
    for warning in event.get("warnings", []) or []:
      print(f"[warning] {warning}")
  else:
    print(json.dumps(event))
PY

echo
echo "Provisioning stream finished."