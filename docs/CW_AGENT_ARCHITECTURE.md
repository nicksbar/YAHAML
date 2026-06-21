# CW Agent Architecture

## Purpose

This document describes how an autonomous CW operator subsystem should integrate with YAHAML without turning YAHAML into the hardware driver.

YAHAML remains the system of record for:

- station and contest state
- QSO persistence
- radio control
- WebSocket event distribution
- operator oversight
- export workflows

The CW agent is an isolated service that consumes YAHAML state and emits validated actions back through YAHAML APIs and events.

## Design Goals

- Keep the agent independently runnable, testable, and killable.
- Default to dry-run mode with no RF transmission.
- Require explicit arming before any transmit action.
- Preserve deterministic safety checks outside the LLM.
- Reuse YAHAML contest, station, radio, and logging abstractions.
- Keep the agent small enough to add without disrupting the existing app.

## Recommended Location

Place the new subsystem under `src/agent/cw/`.

Why this fits the repo:

- The current codebase is a single TypeScript application rooted in `src/`.
- The existing app already uses `src/index.ts` as the orchestration entry point.
- Related services like relay, radio, WebSocket, and contest logic already live in `src/`.
- A separate `services/` or `apps/` tree would be a larger structural change than the repo currently uses.

Suggested shape:

- `src/agent/cw/index.ts` - service bootstrap
- `src/agent/cw/types.ts` - typed models and action schemas
- `src/agent/cw/config.ts` - env and runtime config
- `src/agent/cw/state-machine.ts` - CQ/run QSO state machine
- `src/agent/cw/safety.ts` - centralized safety validator
- `src/agent/cw/brain.ts` - deterministic brain and optional LLM routing
- `src/agent/cw/llm/` - Ollama and Lemonade adapters
- `src/agent/cw/decoder/` - simulated and manual CW input
- `src/agent/cw/keyer/` - simulated and guarded CAT keying
- `src/agent/cw/yahaml-client.ts` - HTTP/WebSocket client for YAHAML
- `src/agent/cw/audit.ts` - agent audit logging
- `src/agent/cw/cli.ts` - terminal UI

## Current YAHAML Integration Points

The agent should integrate with these existing surfaces first.

### Contest state

Current endpoints already expose contest and template data:

- `GET /api/contests/active/current`
- `GET /api/contests/:id`
- `GET /api/contest-templates`
- `GET /api/contest-templates/by-type/:type`
- `GET /api/contests/upcoming`

These are enough for the agent to discover whether Field Day is active and which contest template rules apply.

### Station state

Current station and session data is available through:

- `GET /api/stations`
- `GET /api/stations/:id`
- `GET /api/sessions/me`
- `GET /api/stations/:id/radio`
- `GET /api/radio-assignments/active`

The agent should use these to resolve:

- current station callsign
- Field Day class and section
- current location
- active radio assignment
- whether the session is authorized to control the selected station

### QSO persistence and dupe detection

YAHAML already owns QSO persistence and duplicate-aware export behavior:

- `POST /api/qso-logs`
- `GET /api/qso-logs`
- `GET /api/qso-logs/contest/:contestId`
- `GET /api/qso-logs/:stationId`

The agent should not create a second QSO database. It should submit QSOs to YAHAML and let YAHAML handle dedupe rules, contest validation, scoring, and downstream export compatibility.

### Radio control

YAHAML already exposes radio control endpoints that can be reused by the agent:

- `GET /api/radios`
- `GET /api/radios/:id`
- `GET /api/radios/:id/state`
- `POST /api/radios/:id/frequency`
- `POST /api/radios/:id/mode`
- `POST /api/radios/:id/power`
- `POST /api/radios/:id/ptt`
- `POST /api/radios/:id/start`
- `POST /api/radios/:id/stop`
- `POST /api/radios/test-connection`

The CW agent should use these endpoints instead of reaching into Hamlib internals directly.

### WebSocket events

YAHAML already broadcasts real-time updates over WebSocket channels:

- `qsos` - new QSO events
- `contest:<id>` - contest-scoped updates, aggregate updates, dupe detection
- `stations` - station and band/mode changes
- `radio` - radio state updates
- `logs` - context/audit logs
- `voice` - voice room signaling
- `stats` - aggregate stats
- `band-occupancy` - occupancy summaries

The CW agent should subscribe to these streams to keep its local state current and to publish agent-facing status back into YAHAML.

## Proposed Runtime Flow

1. Agent boots in `DRY_RUN`.
2. Agent loads current station, active contest, and radio state from YAHAML.
3. Agent subscribes to YAHAML WebSocket updates.
4. Agent receives decoded CW text from simulated, manual, or later audio-backed input.
5. Deterministic state machine evaluates the observation.
6. Optional LLM policy helper may suggest a candidate action.
7. Safety validator approves or rejects the action.
8. Approved actions are executed through YAHAML APIs or guarded keyer interfaces.
9. Agent logs every observation, decision, approval, rejection, and transmission attempt.
10. Operator can disarm or kill the agent immediately at any time.

## Data Models

Use explicit typed models for the agent boundary.

### `CwAgentConfig`

Represents runtime configuration:

- YAHAML base URL
- WebSocket URL
- selected station
- selected radio
- contest type
- Field Day class and section
- default mode, backend choices, and rate limits
- dry-run versus armed state
- LLM backend preferences

### `CwObservation`

Represents what the agent knows at a point in time:

- decoded RX text
- current band and mode
- active contest state
- station identity
- dupe status
- radio state
- recent audit events

### `CwAction`

Validated action requests returned by the brain:

- `SEND_CW`
- `LOG_QSO`
- `ASK_REPEAT`
- `SEND_CQ`
- `SET_FREQUENCY`
- `SET_MODE`
- `MARK_DUPE`
- `ABORT_QSO`
- `OPERATOR_ALERT`
- `NOOP`

### `CwDecision`

The result of evaluation:

- selected action
- rationale
- confidence
- safety outcome
- whether an LLM was involved

### `CwQsoState`

State machine payload for a single QSO:

- current state
- partial call heard
- full call heard
- exchange sent/received
- confirm status
- dupe status
- log status

### `FieldDayExchange`

Field Day-specific exchange data:

- callsign
- class
- section
- serial or other contest-specific fields if needed later

### `AgentAuditEvent`

Append-only audit record:

- timestamp
- observation
- decision
- action
- validator result
- execution result
- source backend

### `RadioState`

Operational radio snapshot:

- frequency
- mode
- bandwidth
- power
- PTT state
- VFO
- connection state

### `TxArmState`

Transmit safety state:

- `DRY_RUN`
- `ARMED`
- `DISARMED`
- `KILLED`

## CQ / Run-Mode State Machine

Start with CQ/run mode because it has the clearest deterministic workflow.

Recommended states:

- `IDLE`
- `CQ_SCHEDULED`
- `CQ_SENT`
- `LISTENING_FOR_CALL`
- `PARTIAL_CALL_HEARD`
- `CALL_CONFIRMED`
- `EXCHANGE_SENT`
- `WAITING_FOR_EXCHANGE`
- `EXCHANGE_RECEIVED`
- `CONFIRM_SENT`
- `LOGGING`
- `LOGGED`
- `ERROR_RECOVERY`
- `STOPPED`

The state machine should be deterministic and should not depend on the LLM for correctness.

## Safety Model

Every action must pass a central safety validator before execution.

### `SEND_CW` requirements

- transmit is explicitly armed
- agent is not killed
- current band is valid
- current mode is valid
- Field Day band restrictions are satisfied
- message length is within limit
- cooldown and rate limits are respected
- message text is approved or schema-validated
- the current QSO state allows transmit

### Additional safety controls

- explicit `/kill` should be immediate and irreversible for the running process
- `/disarm` should stop transmit but allow observation and logging
- watchdog heartbeat should fail closed if the agent loses control-plane connectivity
- manual override should always win over autonomous behavior

## LLM Policy Layer

The LLM is optional and should never drive hardware directly.

Use it only for:

- strategy suggestions
- ambiguous text classification
- reasoning about partial calls or noisy input
- model-assisted action proposals that are still checked by deterministic validators

Supported backends:

- Ollama
- Lemonade Server

Preferred transport:

- OpenAI-compatible HTTP APIs where available

Required features:

- backend discovery
- model listing
- model selection
- health check
- strict JSON action output
- timeout and retry
- deterministic fallback when no model is selected

Recommended roles:

- `fast_action_model` for compact JSON decisions
- `reasoning_model` for optional analysis

Default behavior should be deterministic CQ logic if no model is selected.

## Keyer and Decoder Plan

### Decoder

Initial input sources:

- simulated decoded CW text
- manual text injection

Later sources:

- audio-backed decoder input

### Keyer

Initial output sources:

- simulated keyer

Guarded later source:

- CAT keyer interface behind an explicit opt-in backend

The keyer implementation should be hidden behind an interface so the agent can run without RF hardware.

## Terminal UI

The terminal app should be the primary operator surface for the first version.

Recommended panels:

- streaming event log
- current radio and station state
- current QSO state
- decoded RX text
- proposed TX message or action
- accepted and rejected actions
- YAHAML log status
- model and backend status
- command input

Commands to support:

- `/arm`
- `/disarm`
- `/kill`
- `/cq`
- `/stop`
- `/status`
- `/freq <hz>`
- `/mode <mode>`
- `/model list`
- `/model use <backend:model>`
- `/backend radio simulator|hamlib`
- `/backend keyer simulator|cat`
- `/backend decoder simulator|manual`
- `/backend logger yahaml|mock`
- `/inject <cw text>`
- `/help`

## Minimal YAHAML Additions

If the agent needs more than the current API surface, add small backend endpoints instead of coupling to internals.

Likely additions:

- `POST /api/agent/cw/actions` - submit a validated action or log a decision
- `POST /api/agent/cw/audit` - append audit events
- `GET /api/agent/cw/status` - publish agent runtime state
- `POST /api/agent/cw/tx-arm` - update armed/disarmed/kill state
- `GET /api/agent/cw/context` - bundle active contest, station, radio, and band context

Potential WebSocket events:

- `agent:cw:status`
- `agent:cw:decision`
- `agent:cw:tx-arm`
- `agent:cw:kill`
- `agent:cw:audit`
- `agent:cw:proposal`

Keep these additions narrowly scoped.

## Persistence Strategy

Do not duplicate YAHAML QSO persistence.

Use YAHAML for:

- QSOs
- contest validation
- duplicates
- exports

If the agent needs its own history, add a clearly named agent audit model or store.

Recommended separation:

- YAHAML owns logging truth
- CW agent owns operational audit trail

## Implementation Notes

- The first version should be able to run entirely in dry-run with simulated decoder and keyer backends.
- The default CLI should show what the agent would do without transmitting.
- A real radio path should be opt-in and guarded.
- Keep all state transitions explicit and testable.
- Write tests for the state machine and safety validator before wiring in real hardware.

## Suggested First Milestone

The smallest useful milestone is:

1. create `src/agent/cw/`
2. implement the CQ/run-mode state machine
3. add simulated decoder and keyer backends
4. wire the agent to YAHAML contest, station, and logging APIs
5. add the terminal UI and audit log

That gives you a safe, observable autonomous operator loop before any hardware keying is enabled.
