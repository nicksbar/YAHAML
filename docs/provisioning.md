# Remote Provisioning (Current, Source-of-Truth)

This document describes the **actual current provisioning flow** in YAHAML.

> Janus setup is baked into application workflows and runtime config. Legacy "manual Janus setup" docs/scripts were removed intentionally.

## What provisioning does

Provisioning is performed by backend endpoints in `src/index.ts` and implementation logic in `src/remote-provision.ts`.

The flow provisions a remote radio host (typically a Pi or shack edge host) by:

1. Establishing SSH connectivity.
2. Generating and installing an SSH keypair for managed reconnect access.
3. Optionally installing rig control dependencies (`rigctld` via Hamlib packages).
4. Optionally installing and enabling the YAHAML audio publisher service.
5. Optionally installing scoped sudo policy for service management.
6. Persisting provisioning metadata on the radio record.

Provisioning endpoint (streaming logs):

- `POST /api/radios/:id/provision-remote-stream`

Supporting probe endpoints:

- `POST /api/radios/probe-remote-options`
- `POST /api/radios/:id/probe-remote-options`

## Single CLI script (interactive)

Use the repo script:

- `scripts/provision-remote-radio.sh`

It prompts for all required values and calls the same streaming endpoint the UI uses.

### Required inputs

- YAHAML API base URL
- Admin bearer token
- Radio ID
- Remote host/IP
- SSH username + password

### Optional inputs

- Sudo password
- Rig model/device/baud
- Audio capture/playback devices
- Janus URL visible from remote host
- Janus room ID

## Human operator runbook

1. Ensure YAHAML API is running and reachable.
2. Ensure you have an admin session token.
3. Identify target `radioId` in UI/API.
4. Run interactive script:
   - `./scripts/provision-remote-radio.sh`
5. Follow prompts and monitor streamed `[status]`, `[log]`, `[warning]`, `[error]` events.
6. Verify service status from output and in Admin radio details.

## Agent runbook

When automating:

1. Probe remote options first (`probe-remote-options`).
2. Call `provision-remote-stream` and consume NDJSON incrementally.
3. Treat `type=error` as terminal failure.
4. Persist or report:
   - `scopedSudoGranted`
   - remote `ssh.privateKeyPath`
   - warnings + logs
5. Validate resulting host services (`yahaml-rigctld`, `yahaml-audio-publisher`) after provisioning.

## Post-provision validation

Validate all of these:

1. `GET /api/admin/janus/rooms` returns the radio room.
2. Remote host has expected services enabled/running.
3. Radio assignment joins resolve correctly (operator/listener).
4. RTP forward controls work from Admin panel.

## Security notes

- Provisioning requires admin-authenticated API calls.
- Admin token should be handled as a secret.
- Scoped sudo grants are limited to YAHAML-managed service commands.
- SSH key material is stored locally under managed paths and referenced by radio metadata.
