<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-explore-write

Load the explore script pattern library. Call this before writing a runtime-explore script.

## Arguments
- `spec-statements` (optional): Intent statements the explore script should validate. If provided, the skill highlights which observation patterns are most relevant.

## Steps

1. Present the ExploreResult contract:
   - Script reads `CDP_URL` from environment variable (default: `http://localhost:9222`)
   - Script reads `CDP_PORT` from environment variable (default: `9222`)
   - Script connects via `chromium.connectOverCDP(CDP_URL)` from Playwright
   - Script emits JSON to stdout: `{ observations: ObservationResult[] }`
   - Each observation result: `{ id: string, pass: boolean, evidence: string, value?: string | number | boolean }`

2. Present the observation pattern library (9 types):

   | Pattern | Function | Use when |
   |---------|----------|----------|
   | Visibility | `checkVisible(page, selector, label)` | Element should be present and visible |
   | Text content | `checkText(page, selector, label)` | Verify rendered text (always trims whitespace) |
   | Computed style | `checkStyle(page, selector, property, label)` | CSS property inspection (color, font, layout) |
   | Size / touch target | `checkSize(page, selector, minW, minH, label)` | Bounding box measurement (width, height) |
   | Count | `checkCount(page, selector, expected, label)` | Number of matching elements |
   | Attribute | `checkAttribute(page, selector, attr, expected, label)` | ARIA, data attributes, accessibility |
   | Class state | `checkClass(page, selector, className, label)` | Class-based state (dark mode, expanded, active) |
   | Contrast | `checkContrast(page, textSel, bgSel, minRatio, label)` | Text legibility (catches white-on-white, insufficient contrast) |
   | Overflow | `checkOverflow(page, selector, label)` | Scroll/overflow detection (clipped text, hidden content) |

3. Present the interaction library (7 helpers):

   | Pattern | Function | Use when |
   |---------|----------|----------|
   | Safe click | `safeClick(page, selector)` | Click with visibility guard — fails if element not visible |
   | Type + submit | `typeAndSubmit(page, selector, text, key?)` | Form input (default key: Enter) |
   | Drag | `drag(page, source, target, opts?)` | Mouse drag with smooth motion (offset, duration) |
   | Wait for element | `waitFor(page, selector, timeout?)` | Element readiness (default 5000ms) |
   | Wait for transition | `waitForTransition(page, ms?)` | Animation/CSS transition settle (default 500ms) |
   | Page discovery | `connectAndFindPage(cdpUrl)` → filters DevTools protocol pages, returns app page |
   | State reset | `resetState(page)` → calls `window.__DEMO_RESET__()` if available, no-op otherwise |

4. Present the page discovery pattern:
   - `connectAndFindPage(cdpUrl)` — Playwright page with exclusive app focus
   - `resetState(page)` — Programmatic state reset between observations (optional)

5. Present the template script (from `scripts/explore/template-explore.ts`):
   - Full working example showing all patterns in context
   - Baseline state → observations → interactions → re-observations
   - Error handling: visibility guard, timeout handling, evaluate() vs isVisible()
   - Best practices: locator stability, trim text, compute contrasts, skip on missing elements

6. If `spec-statements` provided: highlight which patterns map to each statement.
   - Example: "renders correctly in both themes" → `checkStyle`, `checkContrast`, `checkClass`
   - Example: "all CRUD operations functional" → `typeAndSubmit`, `checkCount`, `checkText`
   - Example: "data persists across restart" → interaction sequence (add → close → reopen → verify)
   - Example: "dark mode toggle visible" → `checkVisible`, `checkClass`

## Contract
- This skill is read-only. It does not create files or modify source.
- The agent writes the script after reading these patterns.
- The script must emit ExploreResult JSON to stdout. Everything else is up to the agent.
- Do not generate the script from the patterns. Present the vocabulary; the agent composes.
- If the agent has specific intent statements to validate, use those to guide pattern selection suggestions.
