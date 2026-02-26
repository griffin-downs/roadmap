# Release Roadmap — v0.6.0

Target: Production-ready autonomous execution system.

## Release Scope

✅ **Completed:**
- Core protocol (define, verify, check, order, orient, reconcile, branch, merge)
- Recovery (checkpoint, restore, audit trail)
- Cross-repo coordination (cross-orient, dependencies)
- Agent executor (sealed API, brief, handoff)
- CLI (integrate, chart, validate, trail)
- Documentation (decisions, adoption guide, patterns)

⚠️ **In progress:**
- API normalization (sub-entry-points)
- Error guidance (structured errors with fixes)
- Integration generation (auto-detect + scaffold)

📋 **Post-release:**
- Performance optimization
- Multi-agent orchestration (regent integration)
- Extended predicates (git artifacts, custom validators)
- Adoption scenarios (real projects)

## Breaking Changes

None. This release maintains backward compatibility with v0.5.0.

## Migration Path

Existing consumers:
- No changes needed
- Can opt-in to new APIs (agent sealed API, error guidance)
- Sub-entry-points recommended but not required

## Testing Checklist

- [x] Protocol: cycles, init/term, reachability
- [x] Recovery: checkpoint/restore idempotent
- [x] Cross-repo: parallel orientation, dependency resolution
- [x] Agent: brief accuracy, handoff completeness
- [x] CLI: all commands + error cases
- [x] Examples: fusion + cockpit real-world scenarios
- [x] Error guidance: all error codes have fixes

## Known Limitations

1. Synchronous operation (async planning for v0.7.0)
2. Single-phase recovery (multi-phase rollback in v0.7.0)
3. Filesystem predicates only (git + custom in v0.7.0)
4. No caching (performance optimization in v0.7.0)

## Support Window

- v0.6.0: 12 months (until v0.8.0 releases)
- Security updates: 18 months
- Deprecation warnings for breaking changes: 6 months notice

## See Also

- `CHANGELOG.md` — detailed changes
- `docs/real-project-adoption.md` — case studies
- `bin/roadmap integrate --auto` — get started
