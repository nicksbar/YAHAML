# Roadmap

## Phase 0: Discovery (current)
- [ ] Consolidate requirements into MVP scope.
- [ ] Inventory UDP logging patterns from common apps.
- [ ] Analyze N3FJP server component (if permitted).
- [ ] Choose data model for logs and activities.

## Phase 1: MVP Foundations
- [ ] Docker Compose skeleton (services, networks, volumes).
- [ ] Core logging API (create/read log entries).
- [ ] Basic web UI for log entry and activity selection.
- [ ] UDP receiver + broadcaster (log entry events).

## Phase 2: Rig Control
- [ ] HAMLib rigctl service container.
- [ ] Remote rig control API.
- [ ] UI integration for frequency/mode capture.

## Phase 3: Group/Club Workflows
- [ ] Multi-user presence, roles, and permissions.
- [ ] Activity templates (Field Day, POTA/SOTA, contest).
- [ ] Per-operator stats and shared scoring.

## Phase 4: Interop & Extensions
- [ ] External logging service stubs + integration plan.
- [ ] Import/export (ADIF, CSV).
- [ ] Optional plugins/extension mechanism.
