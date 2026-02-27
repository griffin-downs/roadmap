# FIXUP: Runtime Explore — Pattern Library + Skill Integration

**Target**: Agent implementing skill integration for runtime-explore observation and diagnostics
**Priority**: Completion gate for runtime-explore validation tier
**Status**: Patterns ready, skill templates defined, integration path clear

---

## 1. Problem Statement

### The Runtime-Only Bug Class

Validation today operates at three levels:
- **Deterministic** (tsc, vitest, build) — catches compile errors
- **Intent** (LLM reads code) — catches logic errors and contract violations
- **Missing**: Running application behavior

Both deterministic and intent validators evaluate artifacts (source files, build outputs, test results). Neither evaluates the **running application**.

### Real Example: Iteration 2 Failures

All deterministic validators passed. Intent evaluation found no logic errors. The app had three runtime bugs:

| Bug | Why deterministic gates missed | Why intent evaluation missed |
|---|---|---|
| Better-sqlite3 ABI mismatch | Build bundles JS, doesn't load native modules | Code is correct; bug is compile-time headers mismatch |
| White text on white background | Tests don't render CSS | CSS source reads correctly; bug is in Tailwind 4 compiled output under `@media` vs `.dark` |
| Theme toggle invisible | No DOM assertion for visibility | Component exists, wired correctly; bug is UX placement in rendered layout |

**Common property**: Code is correct, application is broken. Source-level evaluation cannot catch bugs that only manifest in running processes.

### The Iteration 2 Diagnosis Tax

24 minutes of diagnosis:
- 21 screenshots via scrot/xdotool
- 75 bash commands
- 4 rounds of edits to fix 3 bugs (~20 lines)

**Bottleneck**: Diagnosing without DOM access. Every visual check required: activate window → sleep → scrot → crop → interpret pixels. No programmatic access to computed styles, element dimensions, text content, or application state.

### The Solution: Observe → Judge → Act → Re-Observe

Runtime exploration uses Chrome DevTools Protocol (CDP) to attach to live Electron/web apps:

```typescript
// Non-invasive, read-write access to running app
const browser = await chromium.connectOverCDP('http://localhost:9222')
const page = browser.contexts()[0].pages().find(p => !p.url().includes('devtools://'))

// Structured observations, not screenshots
const textColor = await input.evaluate(el => getComputedStyle(el).color)
const visible = await toggle.isVisible()
const todoCount = await page.locator('.todo-item').count()
```

Enabled by a single flag on Electron launch: `--remote-debugging-port=9222`.

---

## 2. The Pattern Library

### Observation Patterns (9 types)

Each pattern is a type-safe helper that returns `ObservationResult`:

```typescript
interface ObservationResult {
  id: string                            // unique identifier
  pass: boolean                         // success/failure
  evidence: string                      // human-readable evidence
  value?: string | number | boolean     // measured value (optional)
}
```

#### Pattern: Visibility
- **Function**: `checkVisible(page, selector, label)`
- **Returns**: `{ pass: element.isVisible(), evidence: "element found and visible" | "element not found" | "element hidden" }`
- **Use when**: Rendering problem (element should exist and be visible)
- **Example**: Theme toggle button visibility
  ```typescript
  const toggle = await checkVisible(page, '[title*="theme"]', 'theme-toggle')
  // { pass: false, evidence: 'No element matching [title*="theme"] is visible' }
  ```

#### Pattern: Text Content
- **Function**: `checkText(page, selector, expectedText, label)`
- **Returns**: `{ pass: actualText.trim() === expectedText, evidence: `text: "${actualText}"`, value: actualText }`
- **Use when**: Content validation (label text, button text, error messages)
- **Example**: Todo item content
  ```typescript
  const item = await checkText(page, '.todo-item:first-child', 'Buy milk', 'first-todo')
  // { pass: true, evidence: 'text: "Buy milk"', value: 'Buy milk' }
  ```

#### Pattern: Computed Style
- **Function**: `checkStyle(page, selector, cssProperty, expectedValue, label)`
- **Returns**: `{ pass: computed === expectedValue, evidence: `${property}: ${computed}`, value: computed }`
- **Use when**: CSS validation (color, font-family, display, visibility)
- **Example**: Dark mode text color
  ```typescript
  const darkText = await checkStyle(page, '.dark .todo-item', 'color', 'rgb(255, 255, 255)', 'dark-text')
  // { pass: true, evidence: 'color: rgb(255, 255, 255)', value: 'rgb(255, 255, 255)' }
  ```

#### Pattern: Size / Touch Target
- **Function**: `checkSize(page, selector, minWidth, minHeight, label)`
- **Returns**: `{ pass: w >= minWidth && h >= minHeight, evidence: `${w}x${h}px (min: ${minWidth}x${minHeight})`, value: `${w}x${h}` }`
- **Use when**: Accessibility and touch target validation
- **Example**: Button clickability
  ```typescript
  const btn = await checkSize(page, '.submit-button', 44, 44, 'button-touch')
  // { pass: true, evidence: '48x48px (min: 44x44)', value: '48x48' }
  ```

#### Pattern: Count
- **Function**: `checkCount(page, selector, expectedCount, label)`
- **Returns**: `{ pass: actual === expectedCount, evidence: `${actual} items (expected: ${expectedCount})`, value: actual }`
- **Use when**: List validation (number of items, rendered elements)
- **Example**: Todo count
  ```typescript
  const count = await checkCount(page, '.todo-item', 3, 'todo-count')
  // { pass: true, evidence: '3 items (expected: 3)', value: 3 }
  ```

#### Pattern: Attribute
- **Function**: `checkAttribute(page, selector, attributeName, expectedValue, label)`
- **Returns**: `{ pass: attr === expectedValue, evidence: `${attrName}: ${attr}`, value: attr }`
- **Use when**: ARIA, data attributes, accessibility attributes
- **Example**: ARIA role validation
  ```typescript
  const role = await checkAttribute(page, '.sidebar', 'role', 'navigation', 'sidebar-role')
  // { pass: true, evidence: 'role: navigation', value: 'navigation' }
  ```

#### Pattern: Class State
- **Function**: `checkClass(page, selector, className, label)`
- **Returns**: `{ pass: has || !expected, evidence: `class "${className}" ${has ? 'present' : 'absent'}`, value: has }`
- **Use when**: Class-based state (dark mode, expanded, active, disabled)
- **Example**: Dark mode indicator
  ```typescript
  const darkMode = await checkClass(page, 'html', 'dark', 'dark-mode-active')
  // { pass: true, evidence: 'class "dark" present' }
  ```

#### Pattern: Contrast (Accessibility)
- **Function**: `checkContrast(page, textSelector, bgSelector, minRatio, label)`
- **Returns**: `{ pass: ratio >= minRatio, evidence: `${ratio}:1 (min: ${minRatio}:1)`, value: ratio }`
- **Use when**: Text legibility, accessibility compliance (WCAG AA = 4.5:1, AAA = 7:1)
- **Example**: Light mode contrast
  ```typescript
  const contrast = await checkContrast(page, '.todo-item', '.todo-container', 4.5, 'light-contrast')
  // { pass: false, evidence: '1.2:1 (min: 4.5:1)', value: 1.2 }  ← WHITE-ON-WHITE BUG
  ```

#### Pattern: Overflow
- **Function**: `checkOverflow(page, selector, label)`
- **Returns**: `{ pass: scrollW === clientW && scrollH === clientH, evidence: `${scrollW}x${scrollH} (visible: ${clientW}x${clientH})`, value: hasOverflow }`
- **Use when**: Content clipping, truncation (text overflow, scroll required)
- **Example**: List overflow
  ```typescript
  const overflow = await checkOverflow(page, '.todo-list', 'list-overflow')
  // { pass: false, evidence: '800x2000 (visible: 800x300)', value: true }  ← TEXT CLIPPED
  ```

### Interaction Helpers (7 functions)

Helpers for manipulating the running app state:

#### Helper: Safe Click
- **Function**: `safeClick(page, selector)`
- **Behavior**: Click with visibility guard — fails if element not visible
- **Returns**: `Promise<void>` (throws on failure)
- **Use when**: Interaction should only happen if element is present and visible
- **Example**:
  ```typescript
  await safeClick(page, '[title*="theme"]')
  // Throws if toggle not visible (fail-fast, not silent)
  ```

#### Helper: Type + Submit
- **Function**: `typeAndSubmit(page, selector, text, key?)`
- **Behavior**: Focus, clear, type text, press key (default: Enter)
- **Returns**: `Promise<void>`
- **Use when**: Form input with submission
- **Example**:
  ```typescript
  await typeAndSubmit(page, 'input[placeholder*="todo"]', 'Buy milk', 'Enter')
  // Focus input, clear, type, press Enter
  ```

#### Helper: Drag
- **Function**: `drag(page, sourceSelector, targetSelector, opts?)`
- **Behavior**: Mouse drag with smooth motion (configurable offset, duration)
- **Returns**: `Promise<void>`
- **Use when**: Drag-and-drop interactions
- **Options**: `{ offsetX?: number, offsetY?: number, duration?: number }`
- **Example**:
  ```typescript
  await drag(page, '.sidebar-item', '.trash', { duration: 500 })
  // Drag with 500ms smooth motion
  ```

#### Helper: Wait for Element
- **Function**: `waitFor(page, selector, timeout?)`
- **Behavior**: Poll for element existence (default timeout: 5000ms)
- **Returns**: `Promise<Locator>`
- **Use when**: Async rendering, modal appearing
- **Example**:
  ```typescript
  const modal = await waitFor(page, '.delete-confirm', 10000)
  // Wait up to 10s for modal to appear
  ```

#### Helper: Wait for Transition
- **Function**: `waitForTransition(page, ms?)`
- **Behavior**: Sleep for animation/CSS transition to settle (default: 500ms)
- **Returns**: `Promise<void>`
- **Use when**: CSS animations, theme transitions
- **Example**:
  ```typescript
  await safeClick(page, '[title*="theme"]')
  await waitForTransition(page, 300)  // Let dark mode CSS finish
  const contrast = await checkContrast(...)
  ```

#### Helper: Connect and Find Page
- **Function**: `connectAndFindPage(cdpUrl)`
- **Behavior**: CDP connection with DevTools filter (excludes devtools:// pages)
- **Returns**: `Promise<Page>`
- **Use when**: Initial app page discovery
- **Example**:
  ```typescript
  const page = await connectAndFindPage('http://localhost:9222')
  // Connected to app page, DevTools protocol filtered out
  ```

#### Helper: Reset State
- **Function**: `resetState(page)`
- **Behavior**: Call `window.__DEMO_RESET__()` if available, no-op otherwise
- **Returns**: `Promise<void>`
- **Use when**: State reset between observation rounds
- **Example**:
  ```typescript
  await resetState(page)  // Clear todos, reset to baseline
  // (app defines __DEMO_RESET__ if it supports it)
  ```

### Page Discovery Pattern

```typescript
// Entry point: CDP connection
const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? 'http://localhost:9222')

// Find app page (filter out DevTools protocol pages)
const page = await connectAndFindPage(process.env.CDP_URL ?? 'http://localhost:9222')
// or manual:
const contexts = browser.contexts()
const page = contexts[0].pages().find(p => !p.url().startsWith('devtools://'))
```

---

## 3. Script Contract: ExploreResult Shape

### JSON Output Specification

Exploration scripts **must** emit valid JSON to stdout:

```typescript
interface ExploreResult {
  observations: ObservationResult[]
  screenshots?: string[]                    // Optional: paths to captured screenshots
  duration: number                          // Total runtime in milliseconds
}

interface ObservationResult {
  id: string                                // Unique identifier (matches intent statement or test name)
  pass: boolean                             // Success/failure
  evidence: string                          // Human-readable description
  value?: string | number | boolean         // Measured value (optional, depends on observation)
}
```

### Environment Variables

Scripts read from environment:

| Variable | Default | Set by |
|---|---|---|
| `CDP_URL` | `http://localhost:9222` | roadmap-explore-run skill |
| `CDP_PORT` | `9222` | roadmap-explore-run skill |

### Stdout Requirement

**Critical**: Script must write JSON to stdout, nothing else:

```bash
node scripts/explore/validate-todo.ts
# stdout: {"observations":[...],"duration":2341}
```

Anything else (logs, errors, comments) breaks parsing. Use `console.error()` or write to temp files for debugging.

### Script Lifecycle

1. **Connect to app** (via CDP_URL env var)
2. **Discover app page** (filter DevTools protocol)
3. **Run observations** (interaction + measurement sequences)
4. **Emit ExploreResult JSON** to stdout
5. **Disconnect** (let parent teardown process)

---

## 4. Integration Path

### Where Observations Flow

#### During Intent Validation

When `validateNode()` processes an `IntentRule` with `explore` field:

```typescript
interface IntentRule {
  type: 'intent'
  statement: string
  confidence: number
  evaluator: 'self' | 'council'
  context?: string[]
  expandOnFail?: boolean
  maxExpansionDepth?: number
  explore?: string              // Path to explore script
}
```

1. **Intent validator checks** `explore` field
2. **If set**: Run explore script (via `roadmap-explore-run` skill)
3. **Collect observations** from ExploreResult
4. **Pass observations as evidence** to intent evaluator
5. **Evaluator judges** statement against both source context AND observation evidence

#### During Expansion Diagnosis

When intent fails and triggers expansion:

```typescript
interface FixNodeSpec {
  id: string
  produces: string[]
  consumes: string[]
  description: string
  _intentDiagnosis?: {
    statement: string
    confidence: number
    failedObservations: ObservationResult[]    // ← Observations that failed
    evidence: string                            // ← Structured evidence
    suggestedFix: string                        // ← Actionable diagnosis
  }
}
```

Explore observations become actionable evidence in fix nodes:
- `checkContrast` failure → "white-on-white text" → fix node: adjust Tailwind CSS
- `checkVisible` failure → "toggle invisible" → fix node: adjust layout/positioning
- `checkStyle` failure → "dark mode colors wrong" → fix node: fix theme variables

---

## 5. Diagnostics: Observation Evidence Trail

### Observation Flow into Expansion

```
Intent statement: "Dark mode works correctly"
Intent fails (confidence: 0.68)
  ↓
Explore runs: checkStyle, checkContrast, checkClass for dark mode
  ↓
Observations:
  ✅ checkClass('.dark class present')
  ❌ checkContrast('dark text: ratio 1.0:1, min 4.5:1')  ← FAILING
  ✅ checkStyle('dark color: rgb(255,255,255)')
  ↓
Expansion generates fix nodes:
  - fix-dark-contrast: "Adjust dark mode background color to meet 4.5:1 contrast"
    Evidence: { checkContrast failed, textColor: 'rgb(255,255,255)', bgColor: 'rgb(255,255,255)' }
```

### Diagnostic Display (from roadmap-explore-run skill)

```
## 🔬 Explore Results — validate-app.ts

✅ app-launches              — Page loaded at http://localhost:3000
✅ input-field-visible      — element found
✅ todo-added               — count: 1 (expected: 1)
✅ todo-text-correct        — "Test todo"
❌ text-contrast-light      — ratio 1.2:1 (min: 4.5:1)  ← FAILING
✅ dark-mode-active         — html.dark class present
❌ text-contrast-dark       — ratio 1.0:1 (min: 4.5:1)  ← FAILING
✅ theme-toggle-visible     — element found

5/8 passing · 3 failures

Diagnostics:
  • text-contrast-light failure suggests CSS adjustment to bg color
  • text-contrast-dark failure suggests dark mode background needs lightening
  • Suggested files: src/styles/theme.css, src/components/Todo.css
```

---

## 6. Real Example: Intent Fails, Explore Diagnoses, Fix Nodes Execute

### Scenario: Dark Mode Theme Toggle

**Spec statement**: "Dark and light themes render with accessible contrast"

**Intent validator** reads code:
- ✅ Tailwind config has dark mode colors
- ✅ CSS logic switches `.dark` class
- ✅ Component toggles theme on button click
- Confidence: 0.85 (code looks right)

**Intent evaluator** runs with intent `expandOnFail: true`

**Explore script runs** (since `explore: 'scripts/explore/validate-theme.ts'` set):

```typescript
// Observe light mode
await resetState(page)
const lightContrast = await checkContrast(
  page,
  '.todo-item',        // foreground
  'body',              // background
  4.5,
  'light-mode-contrast'
)
// Result: { pass: false, evidence: 'ratio 1.2:1 (min: 4.5:1)', value: 1.2 }

// Switch to dark mode
await safeClick(page, '[title*="theme"]')
await waitForTransition(page, 300)

const darkContrast = await checkContrast(
  page,
  '.todo-item',
  'body',
  4.5,
  'dark-mode-contrast'
)
// Result: { pass: false, evidence: 'ratio 1.0:1 (min: 4.5:1)', value: 1.0 }
```

**Intent validator** receives observations:
- Light mode contrast failure → evidence available
- Dark mode contrast failure → evidence available
- Decision: Intent fails (confidence drops to 0.42)

**Expansion triggers** (since `expandOnFail: true`):

```typescript
// Generated fix nodes (pseudo-code)
const fixes = [
  {
    id: 'fix-light-contrast',
    produces: ['src/styles/theme.css'],
    description: 'Adjust light mode background color to meet 4.5:1 contrast with text',
    _intentDiagnosis: {
      statement: 'Dark and light themes render with accessible contrast',
      failedObservations: [
        { id: 'light-mode-contrast', pass: false,
          evidence: 'checkContrast: ratio 1.2:1 (min: 4.5:1)' }
      ],
      evidence: 'Text color rgb(26,26,26) on bg rgb(255,255,255) yields 1.2:1 ratio. WCAG AA requires 4.5:1.',
      suggestedFix: 'Increase bg brightness or decrease text brightness. Try bg-white -> bg-gray-100.'
    }
  },
  {
    id: 'fix-dark-contrast',
    produces: ['src/styles/theme.css'],
    description: 'Adjust dark mode background color to meet 4.5:1 contrast with text',
    _intentDiagnosis: {
      statement: 'Dark and light themes render with accessible contrast',
      failedObservations: [
        { id: 'dark-mode-contrast', pass: false,
          evidence: 'checkContrast: ratio 1.0:1 (min: 4.5:1)' }
      ],
      evidence: 'Text color rgb(255,255,255) on bg rgb(255,255,255) yields 1.0:1 ratio (white on white). WCAG AA requires 4.5:1.',
      suggestedFix: 'Darken background. Try bg-black -> bg-gray-900 for readable white text.'
    }
  }
]
```

**Agent implements** fix nodes (guided by diagnostic evidence):
- Understands exact problem (white-on-white)
- Knows which files to change (theme.css)
- Has actionable suggestions (bg-gray-900)

**Re-validation** after fix:
```bash
roadmap explore-run scripts/explore/validate-theme.ts --keep-alive
# Runs same script against fixed code
# ✅ light-mode-contrast passes
# ✅ dark-mode-contrast passes
```

**Convergence**: Intent re-evaluates, passes with confidence 0.95.

---

## 7. Known Gaps and Limitations

### Current Status: Patterns Ready, Integration Awaiting

**What's ready**:
- ✅ Observation pattern library (9 types, all with helpers in explore-helpers.ts)
- ✅ Interaction helper library (7 functions in explore-interactions.ts)
- ✅ Script template (scripts/explore/template-explore.ts)
- ✅ Skill definitions (/roadmap-explore-write, /roadmap-explore-run)
- ✅ ExploreResult contract and shape
- ✅ Integration path documented (IntentRule.explore field, expand-on-fail routing)

**What's not complete**:
1. **Visual intent flow not fully wired**: IntentRule.explore field exists, but observe-evidence path to intent evaluator incomplete
2. **explore-runner script execution**: CDP polling and process teardown exist but not integrated into CLI complete command
3. **Expansion diagnostic enrichment**: FixNodeSpec._intentDiagnosis exists but observations not yet flowing into generated fix nodes
4. **Terminal intent gate enforcement**: DAG validation must reject graphs without terminal intent + expandOnFail

### Gaps Don't Block Skills

The skill templates (`roadmap-explore-write.md` and `roadmap-explore-run.md`) are **ready to use now**:
- `/roadmap-explore-write` — Agents can load patterns and write scripts immediately
- `/roadmap-explore-run` — Agents can launch, run scripts, iterate on observations

These skills enable workflow **today**, using the pattern library. Full integration happens as CLI wiring completes (parallel work).

---

## 8. Integration Summary

### For Agents Writing Explore Scripts

1. Call `/roadmap-explore-write` to load patterns
2. Compose script from observation + interaction helpers
3. Call `/roadmap-explore-run` to test iteratively
4. Fix script until all observations pass
5. Observations are diagnostic evidence for future intent expansion

### For Intent Validator (Future Integration)

1. When `validateNode()` sees `IntentRule.explore`
2. Run explore script (via `/roadmap-explore-run`)
3. Pass observations to intent evaluator
4. On failure + `expandOnFail: true` → generate fix nodes with diagnostic evidence

### For Terminal Intent Gate

1. `validateDAG()` must check terminal nodes
2. Reject if no intent rule with `expandOnFail: true`
3. Enforced at DAG creation time (no `--skip-validate` bypasses this)

---

## References

- **FR-INTENT-EXPANSION.md** — Full intent expansion protocol, generateIntentExpansion engine, expandOnFail routing
- **FR-RUNTIME-EXPLORE.md** — Complete runtime explore specification, CDP lifecycle, explore→promote pattern
- **FR-SKILL-CATALOG.md** (lines 165-280) — Source for skill definitions
- **FIXUP-INTENT-EXPANSION.md** — Known gaps from intention evaluation phase, priority fixes
- **src/lib/explore-helpers.ts** — Observation pattern implementations
- **src/lib/explore-interactions.ts** — Interaction helper implementations
- **scripts/explore/template-explore.ts** — Working example script

---

## Next: What to Read

**For agents writing explore scripts**:
- Read `/roadmap-explore-write` skill (patterns + template)
- Read `scripts/explore/template-explore.ts` (working example)
- Read `src/lib/explore-helpers.ts` source (see actual function signatures)

**For intent integration work**:
- Read FIXUP-INTENT-EXPANSION.md § "Correction 2: Intent gates can be visual"
- Read FR-RUNTIME-EXPLORE.md § "Relationship to intent evaluation"
- Read FR-INTENT-EXPANSION.md § "Expansion → Intent → Observation evidence flow"

**For terminal gate enforcement**:
- Read FIXUP-INTENT-EXPANSION.md § "Correction 1: Terminal intent gate is a HARD invariant"
- Read `src/lib/validate-dag.ts` and add `validateTerminalIntentGate()`
