# File Headers — Machine-Readable Metadata

Every source file has structured headers for grep-based discovery.

## Format

```typescript
// @module <name>
// @exports <name>, <name>, ...
// @types <Type>, <Type>, ...
// @entry <roadmap/submodule>

/** Actual file content starts here */
```

## Example

```typescript
// @module protocol
// @exports define, verify, check, order, parallelOrder, orient, merge, branch, reconcile
// @types Graph, NodeSpec, Orientation, Gap
// @entry roadmap/protocol

/**
 * Core DAG protocol: operations for definition, validation, orientation.
 */

export function define<T extends string>(g: {...}): Graph<T> { ... }
```

## Why?

Manual API docs can become stale. Headers are:
- ✅ In source code (always up-to-date)
- ✅ Grep-friendly (no parsing, just regex)
- ✅ Compiler-friendly (TSDoc + custom)
- ✅ CI-friendly (validate headers match actual exports)

## Discovery

```bash
# Find all exported symbols
grep -h "@exports" src/*.ts | tr ',' '\n' | sort | uniq

# Find which file exports a symbol
grep "@exports.*orient" src/*.ts

# Find all modules
grep -h "@module" src/*.ts | sort | uniq

# Find all types
grep -h "@types" src/*.ts | tr ',' '\n' | sort | uniq
```

## Validation

CI checks:
1. Every export has @exports line
2. Every @exports symbol is actually exported
3. Every type in @types exists
4. Every @entry path is valid

```bash
npm run validate:headers
```

## See Also

- Each file in `src/*.ts` and `src/lib/*.ts`
- `MODULE-MAP.md` — generated from headers
- Test: `tests/file-headers.test.ts`
