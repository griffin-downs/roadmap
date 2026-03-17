---
name: roadmap-spec
description: Generate convergence-oriented roadmap specs
user-invocable: true
---

# roadmap-spec

```
  completion = working output, not harnesses
```

A roadmap spec is a bet that converges on intent. The terminal node is where you find out if you won.

## Schema

```bash
roadmap api make
```

Schema is source of truth. If anything below contradicts it, the API wins.

## Before writing

```
╭─────────────────────────────────────────────────────────────────╮
│ ask                                                             │
│                                                                 │
│   what does "done" look like to the human who asked for this?   │
│   not "files exist" — what would they do to check?              │
│   they'd open it. run it. click through it. try the workflow.   │
│                                                                 │
│   your terminal validator does that same thing.                 │
╰─────────────────────────────────────────────────────────────────╯
```

```
╭─────────────────────────────────────────────────────────────────╮
│ trace                                                           │
│                                                                 │
│   what was the original intent?                                 │
│   not what the implementation looks like —                      │
│   what was the human asking for?                                │
│                                                                 │
│   "build a gauge component" ← implementation                    │
│   "see depth readings update in real-time" ← intent             │
│                                                                 │
│   the terminal verifies intent, not implementation.             │
╰─────────────────────────────────────────────────────────────────╯
```

## Two Loops

```
  the DAG loop is across nodes and iterations
  observe → build → verify → discover → narrow

  but there's a second loop inside every node:
  produce → inspect your own output → fix → produce again

  the agent looks at what it made before committing
  compile to PNG? READ the PNG. launch dev server? SCREENSHOT it.
  build a CLI? RUN it and read the output.

  validators are the floor — "did it compile, does the file exist"
  the agent's own inspection is the ceiling

  design node descriptions that tell the agent to iterate:
    "compile, visually inspect every page, fix issues, recompile.
     do not commit until you've verified the output yourself."

  the agent has multimodal vision. it can see rendered output.
  it can read images. it can screenshot browsers.
  use that. if the node produces visual output, the desc should
  say: look at it. not once — until it's right.
```

## Node Descriptions

```
  self-contained    stranger executes from desc + produces + consumes alone
  one concern       build and test are separate nodes
  falsifiable       every node states what's true after it completes
```

The desc is the most important field. It's the prompt the executing agent follows. Weak descs produce weak work.

```
  ❌ WEAK — the agent will write code and commit without looking:

     "Create GaugeDisplay.vue component. Run vue-tsc. Run vitest."

  ✅ STRONG — the agent is forced to inspect and iterate:

     "Create GaugeDisplay.vue — reactive gauge driven by useEmission().
      After implementation: launch dev server, screenshot the gauge.
      READ the screenshot. Can you read the depth number in < 1 second?
      Is anything clipped or overlapping? Is the severity color correct?
      Fix what you find. Screenshot again. Repeat until you'd show it
      to a client. THEN commit."

  ❌ WEAK — functional work with no exercise:

     "Create src/cli.ts entry point. Run pnpm build."

  ✅ STRONG — the agent must run it:

     "Create src/cli.ts entry point with --help and process subcommand.
      After implementation: run node dist/cli.js --help — verify output.
      Run node dist/cli.js process test-input.json — verify it produces
      expected output. If output is wrong, fix and re-run. Do not commit
      until the CLI produces correct output on real input."

  ❌ WEAK — infrastructure with no proof of life:

     "Write Dockerfile. Run docker build."

  ✅ STRONG — the agent proves it runs:

     "Write Dockerfile for production build. After writing:
      docker build -t myapp . — must succeed.
      docker run --rm -p 3000:3000 myapp — must start.
      curl http://localhost:3000/health — must return 200.
      If any step fails, fix and rebuild. Do not commit
      until the container serves a health check."
```

The pattern: **implementation + inspect + iterate + condition for commit.** Every node desc for visual, functional, or infra work must include what to check and when to stop.

## Validators

```
  question          how would you know this works if you couldn't read the code?

  visual work       launch dev server → screenshot → evaluate
  functional work   run the thing → check output → verify behavior
  infrastructure    build container → run it → health check

  refuse            grep as behavioral evidence
  refuse            artifact-exists as terminal validator
  refuse            "it compiles" as proof of correctness
  surface           when you can't write a real validator — say so
```

## Convergence

```
  observe → build → verify → discover → narrow

  one pass is never enough
  terminal discovers what's still wrong
  discoveries become successor scope
  each iteration narrower than the last

  orbiting = same findings across iterations → stop, surface to human
```

## End-to-end

```
  the most important validator runs the complete workflow

  not "login component renders"
  → start app, navigate to login, enter credentials, see dashboard

  not "CLI has --help"
  → create test input, run CLI, read output, verify it matches

  at least one node exercises the full path a user would take
```

## Self-check

```
  □ stranger can execute every node from desc alone?
  □ terminal uses the thing the way a human would?
  □ verifying intent, not implementation?
  □ terminal discovers what to do next?
  □ full workflow exercised end-to-end?
  □ no grep/exists as behavioral evidence?
  □ for visual work: does terminal screenshot and evaluate?
  □ for functional work: does terminal exercise actual behavior?
  □ for infrastructure: does terminal run the pipeline end-to-end?
```

## Presentation

```
  the human watching execution should see the DAG come alive

  every scroll lands on something worth looking at
  show, don't tell — diagram alone, never diagram + restatement
  color fields (🟥🟧🟨🟩🟦🟪) as dividers and progress
  box drawing for structure, emoji for status

  on orient     show the shape — what's done, what's next, where you are
  on dispatch   banner — what agents are working on, what they produce
  on complete   advancement — what passed, what's next
  on terminal   the full result — trajectory, convergence, successor

  the user should never have to ask "what's happening?"
  if they have to ask, you aren't showing enough
```

## Create

```bash
roadmap make docs/<dag-id>.spec.json --note "<intent>"
roadmap orient --note "begin <dag-id>"
```

## Chain

```
  this skill is called when you need a new DAG
  after make + orient → /roadmap-auto to execute
  the chain: orient → spec → make → orient → auto → review → {endcontext | spec}
```
