# Rollout · two-phase open-source release

This repo went public for the **ML Prague 2026** poster. The maintainer is presenting at the conference; the contribution surface is opening in two phases.

## Phase 1 · 2026-05-01 → ~2026-05-15

The conference window. Single maintainer, narrow attention.

- Repository: **public**
- License: MIT
- Issues: **open** — bug reports, install snags, questions all welcome
- Pull requests: **technically allowed but discouraged via PR template** — small fixes (typos, README) may be reviewed in-window; larger changes please file an issue first
- Discussions: **off**
- npm publish: not yet (the package is installable from a git tag; npm publish is in phase 2)
- `CONTRIBUTING.md`: not yet — its absence is the signal

This phase exists to gather signal — what confuses people on first install, what the README leaves implicit, what use cases the maintainer didn't anticipate. Issue traffic during these two weeks shapes phase 2.

## Phase 2 · ~2026-05-15 onward

After the conference, with the maintainer back at full attention.

- `CONTRIBUTING.md`: written based on the actual confusion patterns from phase 1
- Discussions: **on**, for Q&A (issues stay for bugs)
- Pull requests: **welcome** — PR template replaced with normal review guidance
- npm publish: `@ocean-synaptics/roadmap` v0.2.x or v0.3.0 (version bump depends on whether phase 1 required hotfixes)
- Branch protection: required PR review enabled
- README banner updated from "PRs deferred" to "PRs welcome"

## Versioning

- `v0.2.0` — public-release tag, ML Prague 2026
- `v0.2.x` — phase-1 hotfixes if needed
- `v0.3.0` — first phase-2 release, post-conference

Until v1.0, expect occasional breaking changes between minor versions. Pin to a tag if you depend on this in production.

## How to read the calendar

- Right now — file issues, fork freely, install from `git+https://github.com/Ocean-Synaptics/roadmap.git`
- ~mid-May 2026 — open a PR, start a discussion, install from npm
- After v1.0 — semver applies

## Contact

For conference-window questions: file an issue. For anything else: open after phase 2.
