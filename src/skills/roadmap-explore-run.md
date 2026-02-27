<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-explore-run

Run an explore script against the live application and return observations.

## Arguments
- `script` (required): Path to the explore script (typically `scripts/explore/validate-*.ts`)
- `launch` (optional): Launch command (default: inferred from package.json scripts or `npx electron .`)
- `port` (optional): CDP port (default: 9222)
- `build` (optional): Build command to run before launch (default: inferred from package.json or `npx electron-vite build`)
- `keep-alive` (optional, boolean): Don't teardown after run — for rapid iteration (app stays running for next call)

## Steps

1. **Pre-flight check**: If app not already running (no keep-alive state from previous run):
   a. Build if needed: run `$build` command or default inferred command
   b. Launch app: `$launch --remote-debugging-port=$port`
   c. Poll CDP readiness: GET `http://localhost:$port/json/version` until success or timeout (10s default)

2. **Run explore script**:
   - Set environment variables: `CDP_URL=http://localhost:$port`, `CDP_PORT=$port`
   - Execute: `npx tsx $script`
   - Capture stdout JSON

3. **Parse ExploreResult**: Extract `{ observations: ObservationResult[] }`

4. **Present observations** in human-readable format with emoji status:
   ```
   ## 🔬 Explore Results — validate-app.ts

   ✅ input-field-visible     — element found
   ✅ todo-added              — count: 1 (expected: 1)
   ✅ todo-text-correct       — "Test todo"
   ❌ text-contrast           — ratio 1.2:1 (min: 4.5:1)  ← FAILING
   ✅ dark-mode-active        — html.dark class present
   ❌ dark-mode-contrast      — ratio 1.0:1 (min: 4.5:1)  ← FAILING

   4/6 passing · 2 failures
   ```

5. **If failures exist**, present diagnostic context:
   - Which observations failed + actual values
   - Suggest which source files likely need changes (reference node's produces list)
   - Example: "text-contrast failure suggests Tailwind CSS or component CSS needs adjustment"

6. **If keep-alive flag set**: leave app running for next call (skip teardown)

7. **If keep-alive not set**: teardown app process and clean up

## Contract
- This is for iteration, not for validation. Use `/roadmap-done` for formal validation.
- Agent can call this repeatedly: fix script → re-run → fix script → re-run.
- With `--keep-alive`, app stays up between runs — faster iteration cycle for rapid fix-test loops.
- Observations are displayed with emoji status (✅/❌) for quick visual scanning.
- Failures include actual values, not just pass/fail — the agent needs to see what's wrong to diagnose.
- Script crashes or CDP connection timeouts are reported as fatal errors with troubleshooting hints.
