# demo

Get the donjon fleet demo running. Services up, browser open, human watches.

## /demo

1. `assay status` — check what's running
2. If keel or stratum not healthy, `assay up`
3. `assay status` to confirm
4. Open browser: `firefox http://localhost:3000 &`
5. Report what's live: topics, surfaces, authority, waypoints

## /demo refresh

1. `assay down`
2. `assay up`
3. Report status

## /demo stop

1. `assay down`

## /demo two-surface

1. `assay up`
2. Open two browsers: `firefox http://localhost:3000 &` twice, or electron + firefox
3. Report surface count from `assay status`

## Rules

- The human is looking at the live surface — don't screenshot what they can already see
- Report service health and keel state (topics, surfaces, authority, waypoints)
- If something fails, show the log
