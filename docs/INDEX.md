# YAHAML Documentation Index

Welcome to the YAHAML documentation. Select the section relevant to your needs.

**Start with:** [STATUS.md](../STATUS.md) - Current project status, phase completion, and deployment readiness

## Getting Started
- **[README.md](../README.md)** - Quick start guide and feature overview
- **[STATUS.md](../STATUS.md)** - Project status, phase completion, performance metrics
- **[quick-start.md](quick-start.md)** - Five-minute setup walkthrough

## Architecture & Design
- **[architecture.md](architecture.md)** - System design, services, data models, and real-time updates (WebSocket)
- **[project-structure.md](project-structure.md)** - Directory structure and module organization
- **[ui-design-system.md](ui-design-system.md)** - Component library, spacing, colors, theming
- **[decisions.md](decisions.md)** - Key architectural decisions and rationale

## Development
- **[testing.md](testing.md)** - Unit, API, and E2E testing patterns (213 tests passing)
- **[testing-architecture.md](testing-architecture.md)** - Test infrastructure and utilities
- **[code-recommendations.md](code-recommendations.md)** - Code style and patterns
- **[LOGGING_BEST_PRACTICES.md](LOGGING_BEST_PRACTICES.md)** - Context logging patterns

## Deployment
- **[DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md)** - Production deployment guide and environment variables
- **[deployment-complete.md](deployment-complete.md)** - Comprehensive deployment (Docker, VPS, Cloud platforms)
- **[deployment-quick-ref.md](deployment-quick-ref.md)** - Quick reference for common deployment tasks

## Features
- **[radio-control.md](radio-control.md)** - HAMLib integration and remote rig control
- **[callsign-management.md](callsign-management.md)** - Multi-operator and club callsign setup
- **[contest-management.md](contest-management.md)** - Contest templates, scoring, validation
- **[ui-quick-reference.md](ui-quick-reference.md)** - UI quick start and shortcuts
- **[ui-redesign-summary.md](ui-redesign-summary.md)** - UI redesign changes and updates

## Protocol & Integration
- **[protocol-summary.md](protocol-summary.md)** - N3FJP protocol overview
- **[n3fjp_captured_protocol.md](n3fjp_captured_protocol.md)** - Detailed BAMS message format
- **[n3fjp_protocol_debugging.md](n3fjp_protocol_debugging.md)** - Debugging N3FJP connections
- **[n3fjp_testing_guide.md](n3fjp_testing_guide.md)** - Testing relay connections
- **[protocol-research.md](protocol-research.md)** - Protocol research and analysis
- **[tcp-relay-protocol.md](tcp-relay-protocol.md)** - TCP relay protocol details
- **[protocols-udp.md](protocols-udp.md)** - UDP protocol support
- **[server-mode-analysis.md](server-mode-analysis.md)** - N3FJP server mode details
- **[capture-and-analysis.md](capture-and-analysis.md)** - Network capture and analysis tools
- **[capture.md](capture.md)** - PCAP capture setup
- **[canonical-log-model.md](canonical-log-model.md)** - Unified logging model

## Requirements & Planning
- **[requirements.md](requirements.md)** - Functional and non-functional requirements
- **[risks.md](risks.md)** - Known risks and mitigation strategies
- **[implementation-roadmap.md](implementation-roadmap.md)** - Implementation roadmap
- **[research-summary.md](research-summary.md)** - Research findings summary
- **[protocol-analysis-setup.md](protocol-analysis-setup.md)** - Protocol analysis methodology

## API & Database
See inline code comments in `src/` for detailed API documentation. Run `npm run db:studio` to browse the schema visually.

## Frequently Asked Questions

### How do I deploy to production?
See [DEPLOYMENT_READINESS.md](DEPLOYMENT_READINESS.md) for environment setup, or [deployment-complete.md](deployment-complete.md) for Docker/VPS/Cloud options.

### How do I add a new contest template?
See [contest-management.md](contest-management.md) and check `prisma/seed.ts` for examples.

### How do I test the N3FJP relay?
See [n3fjp_testing_guide.md](n3fjp_testing_guide.md) or [n3fjp_protocol_debugging.md](n3fjp_protocol_debugging.md).

### How do I contribute?
See [CONTRIBUTING.md](../CONTRIBUTING.md) in the root directory.

### What's the current status?
- **Phase 5.1 Complete** (Feb 1, 2026): Contest templates system with 19 templates and self-managed calendar
- **Real-time Updates** (Feb 1, 2026): WebSocket with auto-reconnect, live band occupancy, live event logs
- **Test Suite**: 213 tests passing across all components
- **Backend**: REST API, N3FJP relay, contest validation, export (ADIF/Cabrillo)
- **Frontend**: React dashboard with Vite dev proxy, responsive UI, live updates

## Contact & Support

For issues or questions:
1. Check this documentation
2. Review inline code comments in source files
3. Check test files for usage examples
4. Check logs: `npm run dev` shows all component output

---

**Last Updated:** February 1, 2026  
**Test Status:** 213 tests passing ✅  
**Build Status:** Ready for deployment
