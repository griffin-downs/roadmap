# Security Audit Checklist — GitSafe + Chatelet

## Path Safety

- [x] `validatePath()` rejects `..` traversal
- [x] `validatePath()` rejects absolute paths (`/`)
- [x] Deny-list patterns applied before any git operation
- [x] Regex fallback to string matching on malformed patterns

## Resource Limits

- [x] `maxBytes` enforced on individual blob reads
- [x] `maxDepth` enforced on tree listings
- [x] Hard cap (10000) on `lsTree` entries
- [x] Cumulative size check in `packs extract`
- [x] 5000ms timeout on all `execSync` calls

## Command Construction

- [x] Path validated before shell interpolation
- [ ] Ref parameter not independently validated (SEC-003, accepted risk)

## CI Gates

- [x] `gate-chatelet-keep.yml` — KeepBudget enforcement on PR
- [x] `gate-pack-manifests.yml` — Pack manifest validation on PR

## Deny-list Coverage

- [x] `.env` files blocked
- [x] `.ssh/` paths blocked
- [x] `credentials/` paths blocked
- [x] Custom patterns via `GitSafeConfig.denylist`

## Error Handling

- [x] `GitSafeError` with structured code + context
- [x] `ExtractError` with structured code + context
- [x] Error context includes path, size, limits for diagnosis
