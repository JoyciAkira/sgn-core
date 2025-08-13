# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.4] - 2025-01-13

### Changed
- **Branding**: Updated from "Secure Gossip Network" to "Socrate Global Network"
- **README**: Complete rewrite in English with professional structure
- **Package**: Updated name to "sgn-core" and description for global audience
- **License**: Updated copyright to "Socrate Global Network"
- **Documentation**: Added CONTRIBUTING.md and GitHub issue templates

### Added
- **Production Metrics**: Advanced Prometheus metrics (histograms, consistency checks)
- **Monitoring**: Smoke test, idempotency test, and live metrics watch scripts
- **Deduplication**: CID-based duplicate detection with metrics tracking
- **Consistency**: DB-FS consistency monitoring and admin endpoints
- **Outbox Management**: Drain functionality for single-node development

## [0.1.0-alpha.3] - 2025-01-12

### Added
- **VSCode Extension**: Status bar "live" indicator with real-time daemon connection status
- **VSCode Extension**: Quick actions (Open KU, Verify, Copy CID) via status bar click
- **VSCode Extension**: Output channel "SGN" for discrete event logging
- **VSCode Extension**: Command palette commands for latest KU operations
- **VSCode Extension**: WebSocket hardening with exponential backoff reconnection
- **Daemon**: Graceful shutdown on SIGINT/SIGTERM with proper resource cleanup
- **Events**: Optional authentication via SGN_EVENTS_ORIGIN and SGN_EVENTS_BEARER environment variables
- **Tests**: Serial execution mode for WebSocket tests (`npm run test:e2e:serial`)
- **Tests**: Retry mechanism for HTTP requests in events tests

### Fixed
- **Daemon**: `/publish` endpoint now defensive - warn mode never returns 500, enforce mode returns 403/400
- **Daemon**: `/edges` endpoint idempotent with proper trust policy handling (warn/enforce)
- **Daemon**: `/metrics` endpoint never returns 500, includes fallback for Prometheus format
- **Events**: Authentication is truly opt-in - no blocking in local development without env vars
- **Tests**: Edges database isolation prevents SQLite lock conflicts between test suites
- **Tests**: Events tests stabilized with proper health checks and retry logic

### Changed
- **Scripts**: Converted `test-5-node-network.js` to `.cjs` format for CommonJS compatibility
- **Storage**: Enhanced graceful close with timer cleanup and final flush
- **Events**: WebSocket server exposes close() method for proper shutdown

### Technical
- **Performance**: Maintained 613.5 req/s throughput with p50: 1ms, p95: 2ms latencies
- **Reliability**: All defensive endpoints handle edge cases without crashes
- **Monitoring**: Comprehensive metrics tracking for WebSocket clients, delivery, and acknowledgments

## [0.1.0-alpha.2] - Previous Release
- Initial daemon HTTP/JSON-RPC implementation
- Real SQLite storage with WAL mode
- WebSocket events system
- Trust management with key rotation
- Performance monitoring and metrics

## [0.1.0-alpha.1] - Initial Release
- Basic SGN proof of concept
- In-memory storage
- CLI interface
- Core KU (Knowledge Unit) structure
