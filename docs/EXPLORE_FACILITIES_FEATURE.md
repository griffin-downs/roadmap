# 🔍 Explore Facilities — Now Fully Accessible

**Status**: ✅ SHIPPED
**Version**: roadmap-adversarial v0.8.0+
**Commits**: efe6f16, ebcf5bf, bf056d4, 0ef29bc

---

## What's New

The **explore facilities** are now production-ready with ironclad error handling and complete API discoverability.

### Three Layers of Guidance on Failure

When `explore-validate-contract` fails, you get:

1. **Human-readable error** — Clear message + numbered action items
2. **Text API reference** — Complete documentation of all helpers
3. **JSON API surface** — Machine-parseable for downstream tools

Example error output:
```
❌ Cannot connect to CDP
   Failed to connect to http://localhost:9222

🔧 REQUIRED ACTIONS (in order):
   1. Check if something is listening: lsof -i :9222
   2. Start your app: npm run electron:dev
   3. Verify connection: curl http://localhost:9222/json/version

⚠️  DO NOT READ SOURCE CODE OR INVESTIGATE FURTHER
    All required information is in the messages above.

[Full API reference in text]

📋 API Surface (JSON):
{
  "observations": [
    { "name": "checkVisible", "params": [...], "returns": "ObservationResult", "desc": "..." },
    ...
  ],
  "types": { "ObservationResult": {...}, "ExploreResult": {...} },
  "cdpSetup": { "electron": "...", "chrome": "...", "env": {...} }
}
```

---

## Usage

### See the Full API
```bash
roadmap explore --api
```

**Output**: 9 observation helpers + 7 interaction helpers + 3 runtime helpers + type definitions

### Validate a Contract
```bash
roadmap explore ./spec-clarified.json
```

### Custom CDP Port
```bash
CDP_PORT=9333 roadmap explore ./spec-clarified.json
```

### Write Custom Explore Scripts
```typescript
import { checkVisible, checkCount, checkContrast } from 'roadmap/explore';

// No imports needed for:
// - Playwright
// - CDP connection
// - Browser context detection
// - Page filtering
// - DevTools setup
//
// roadmap/explore library handles all of that!
```

---

## API Surface (Quick Reference)

### 9 Observation Patterns

| Helper | Purpose | Returns |
|--------|---------|---------|
| checkVisible | Element in viewport | ObservationResult |
| checkInteractive | Element visible + enabled | ObservationResult |
| checkCount | DOM matches >= threshold | ObservationResult |
| checkContrast | WCAG AA contrast ratio | ObservationResult |
| checkText | Extract & validate text | ObservationResult |
| checkStyle | CSS property value | ObservationResult |
| checkSize | Element dimensions | ObservationResult |
| checkAttribute | HTML attribute value | ObservationResult |
| checkClass | CSS class presence | ObservationResult |
| checkOverflow | Scrollable overflow state | ObservationResult |

### 7 Interaction Helpers

| Helper | Purpose |
|--------|---------|
| safeClick | Click with visibility guard |
| typeAndSubmit | Fill input + press key |
| drag | Smooth mouse drag |
| waitFor | Wait for element ready |
| waitForTransition | Wait for CSS transitions |
| connectAndFindPage | CDP connection + page discovery |
| resetState | Call window.__DEMO_RESET__() |

### 3 Runtime Helpers

| Helper | Purpose |
|--------|---------|
| launchApp | Build + launch + poll CDP |
| runExploreScript | Execute explore script |
| teardown | Clean shutdown |

---

## Guarantees (Ironclad)

✅ **Every error prints the full API** — No need to read source code
✅ **Concrete action items** — Numbered steps, no ambiguity
✅ **"DO NOT INVESTIGATE" warning** — Signals: all info is here
✅ **JSON API output** — Machines can parse it programmatically
✅ **Platform-specific guidance** — macOS/Linux/Windows instructions
✅ **No file reading required** — Everything in the error message

---

## Integration with Roadmap DAG

```
init-gate (vague plan)
  ↓ produces PlanClarityGap[]
  ↓
spec-generator (clarify-to-contract)
  ↓ produces spec-clarified.json
  ↓
explore-validate-contract (THIS LAYER)
  ↓ runs observations via CDP
  ↓
spec-verifier (verify-against-contract)
  ↓ validates observations match contract
  ↓
terminal-gate (validate-terminal-gate-spec)
  ↓
✅ E2E spec-threading closure
```

---

## For Agents

**If explore fails**:
1. Read the error message (all info is there)
2. DO NOT search source code
3. DO NOT read files
4. Follow the numbered action items
5. If you need the full API, run: `roadmap explore --api`

**If you're writing explore code**:
- Import from `roadmap/explore` (not Playwright directly)
- Use the 9 observation patterns
- Let the library handle CDP, context, page detection

---

## Quick Start

```bash
# 1. See available helpers
roadmap explore --api

# 2. Start your app with CDP
npm run electron:dev
# or: chrome --remote-debugging-port=9222

# 3. Validate contract
roadmap explore ./spec-clarified.json

# 4. (Optional) Write custom explore code
# import { checkVisible, checkCount } from 'roadmap/explore';
```

---

## Commits

- **efe6f16** — Initial API reference + error improvements
- **ebcf5bf** — Ironclad action items + always-print API
- **bf056d4** — Clarify workflow (CLI, not raw scripts)
- **0ef29bc** — Include API as JSON in error output

---

## Questions?

Run: `roadmap explore --help` or `roadmap explore --api`

All information is embedded in the CLI. No need to investigate further.
