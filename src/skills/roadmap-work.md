<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-work

Get the work brief for a node. Run this before implementing.

## Arguments
- `node` (required): Node ID to work on.

## Steps
1. Run: `$ROADMAP_BIN show $node` — parse the JSON output.
2. Present the brief:
   - **Produces**: files to create/modify. These are your only write targets.
   - **Consumes**: files to read. These are your only read inputs in swarm mode.
   - **Ambient**: shared context available but not a dependency edge. List paths; do not read unless the agent requests.
   - **Validate**: rules that will run on `complete`. Inspect these — they are your acceptance test.
   - **Desc**: what this node does, in the node's own words.
   - **Mode**: `execute` (produce artifacts) or `plan` (expand into sub-nodes).
3. Read each file in `consumes` and present content to the agent.
4. If `ambient` paths exist, list them without reading. The agent decides which (if any) to inspect.

## Contract
- **In swarm mode: read ONLY consumes files.** Nothing else. The contracts are the interface — do not explore upstream, do not browse the repo.
- **Produces are exclusive write targets.** No other agent writes these files. You own them for this node.
- **Validate is your acceptance test.** Run these locally before calling `/roadmap-done`. If a validator will fail, fix the produce — not the validator.
- **Ambient is not a dependency.** It informs implementation but does not trigger re-execution. Spec docs, shared type defs, project config belong here.
