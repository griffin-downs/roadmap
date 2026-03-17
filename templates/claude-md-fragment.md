<!-- roadmap:start -->
## Roadmap

DAG-governed execution. `roadmap orient` is the source of truth — run it first, every session.

```
  skills
  /roadmap-orient      self-orient — position, fleet state, what to do next
  /roadmap-spec        design convergence-oriented specs
  /roadmap-auto        autonomous execution with rich reporting
  /roadmap-review      session completeness check before closing
  /roadmap-endcontext  persist learnings, generate boot prompt
```

```
  when executing a roadmap, the human sees the DAG come alive

  orient     show shape — what's done, what's next, where you are
  dispatch   banner — what agents work on, what they produce
  complete   advancement — what passed, what's next
  terminal   full result — trajectory, convergence, successor

  completion = working output, not harnesses
  refuse grep as behavioral evidence
  every scroll lands on something worth looking at
```

```
  mutation rules

  CLAUDE.md     mutate anchored sections, append references
                never: session context, TODOs, task lists

  docs/         specs, ADRs, design docs — things with shelf life
                never: session logs, scratch, anything that expires

  .roadmap/     append-only (trail, completed, handoffs)
                head.json via CLI only. heads/ immutable after archive.

  ephemeral → handoff.  permanent → CLAUDE.md.  actionable → spec.
  nothing else gets written to the repo.
```
<!-- roadmap:end -->
