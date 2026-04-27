---
description: Invoke to read the Keel Boundary Thesis · the remote-by-design doctrine for the keel↔stratum↔pipeline interface. Parallel to /pipeline-thesis and /rovmk3-thesis. Says keel is ALWAYS treated as a remote service even when collocated, so the transition from tablet-collocated (A) to topside-daemon (B) is deployment, not engineering. Use at session-start when working on anything that crosses the keel boundary (keel session state · stratum composables reading keel · pipeline writing layouts · auth tokens · discovery · asset store) OR when tempted to take an in-process shortcut "because we're on the same device."
---

# keel-boundary-thesis

Refresher on the keel boundary's architectural purity. Invoke when designing or
reviewing anything that crosses keel ↔ stratum ↔ pipeline. The thesis says:
**design for B, deploy as A** · keel is always remote, even when it isn't.

## The thesis in one sentence

Keel is a peer process reached over the wire, always — the collocation on a
single tablet today is a deployment convenience, not an architectural
commitment.

## The model in one shape

```
  binary + deviations → pipeline → keel asset store (via keel ingest API)

  vessel (ROS/RTSP/UDP) → keel runtime ← single subscriber · single writer

  stratum × N surfaces ← keel projections (/layout /state /session)

  one keel. many stratum. pipeline is a client of keel, not a peer of stratum.
```

Today: keel + stratum collocated on commander tablet (topology A).
Tomorrow: keel runs on a topside daemon box, tablets are thin clients
(topology B). The code is identical; only deployment differs.

## The five invariants (non-negotiable)

```
  I  · NO IN-PROCESS SHORTCUTS    stratum never imports keel internals ·
                                  never shares memory · never reads a file
                                  keel wrote without asking keel (even on
                                  same device)

  II · KEEL_URL IS CONFIG         not a constant · stratum reads env/config
                                  at boot · A: "localhost:8765" ·
                                  B: "<daemon-host>:8765" · same code

  III · AUTH TOKEN IS ALWAYS      even on localhost · even in dev · stratum
        PRESENT                   presents a bearer token · keel validates ·
                                  day-one habit so B-day is uneventful

  IV · CONNECTION IS RETRY +      stratum survives keel restart · reconnects
       HEARTBEAT                  with backoff · same code handles "keel
                                  paused for OTA" and "keel is remote and
                                  glitched"

  V  · ASSET STORE IS KEEL-       pipeline NEVER writes directly to
       MEDIATED                   stratum's filesystem · always via keel
                                  ingest endpoint · in A that endpoint
                                  writes to local disk · in B it writes to
                                  the daemon's disk · same client code
```

## The purity test

Answer YES to each, or book the failure as tech debt with a B-day cost:

```
  Can I move keel to a different machine without changing stratum code?
  Can I restart keel without reloading the tablet?
  Can I connect a second stratum to the same keel?
  Can I run stratum against a mock keel for unit tests?
  Can I audit what stratum asks of keel from a single protocol schema?
```

If any answer is "no, because we collocated X" — that's a B-day tax booked
today.

## The failure mode (what this prevents)

```
  without discipline                 the B-day (collocated → daemon) becomes
  ──────────────────                 a multi-week engineering project
  stratum imports keel/types         refactor to protocol schema
  KEEL_URL hardcoded localhost       hunt every call site
  no auth because "same process"     security audit + retrofit
  stratum reads keel's tempfiles     redesign asset distribution
  pipeline writes to stratum fs      define keel ingest API belatedly
  subprocess lifecycle assumptions   handle the "keel already running"
                                     case everywhere

  with discipline                    the B-day is a sysadmin task
  ───────────────                    ────────────────────────────
  all access via wire protocol       change KEEL_URL in config
  auth tokens already present        no security surprises
  retry/heartbeat already works      keel restart = UX blip
  keel-mediated ingest on disk        same code, different filesystem
```

## The two topologies

```
  TOPOLOGY A · collocated (TODAY · through September milestone)
  ──────────────────────────────────────────────────────────────
    ┌─────────────────────────────────────┐
    │ commander tablet (Android)          │
    │                                     │
    │  keel daemon     ←──LAN─────────────│──→ ROV (ROS/RTSP/UDP)
    │  (localhost:8765)                   │
    │  stratum WebView → localhost:8765   │
    │                                     │
    └─────────────────────────────────────┘

  TOPOLOGY B · topside daemon (FUTURE · when maritime catches up)
  ──────────────────────────────────────────────────────────────
    ┌───────────────────────┐     ┌─────────────────────────┐
    │ topside daemon box    │     │ tablet (thin WebView)   │
    │ (NUC / RPi / embedded)│←LAN─│ stratum → <daemon>:8765 │
    │ keel daemon + ingest  │     │                         │
    │ :8765                 │     └─────────────────────────┘
    │                       │     ┌─────────────────────────┐
    │                       │←LAN─│ tablet (another surface)│
    └───────────────────────┘     └─────────────────────────┘
           ↓ ethernet
      ROV (ROS/RTSP/UDP)
```

**The move from A to B**:
- (a) change `KEEL_URL` in config from `localhost:8765` to `<daemon>:8765`
- (b) package keel as a daemon (systemd / init / OCI) on the topside box
- (c) repackage stratum as a thin WebView app (no keel bundled)

That's it. No code touches. No protocol redesign. No round-N cleanup.

## The yellow zones to watch

Today's round-3 state has a few yellow spots that are A-friendly but need
B-discipline before shipping:

```
  pipeline writes to model/output/*   A: stratum reads as Vite assets · fine
                                      B: needs keel ingest API · pipeline
                                         POSTs to keel · keel serves to
                                         stratum on fetch
                                      round-4 task: define the API shape

  layouts are build-time baked        A: regen = stratum rebuild on dev box
                                      B: layouts must be RUNTIME-FETCHABLE
                                         by stratum from keel · either
                                         pre-compiled JSON + generic
                                         renderer OR Vue SFC runtime compile
                                      round-4 task: pick strategy

  no auth tokens anywhere             A: localhost implicitly trusted · OK
                                         for dev
                                      B: REQUIRED · pre-shared key or cert
                                      round-3 hygiene: add token scaffold
                                      now so B-day is uneventful
```

## Read these

1. `fleet/CLAUDE.md` section "keel boundary · remote-by-design"
2. `~/src/keel/CLAUDE.md` — keel's own doctrine
3. `~/src/stratum/CLAUDE.md` — stratum's dumb-component + projection model

## The question to ask

Before any code that touches the keel↔stratum or keel↔pipeline seam:

```
  does this work FIT the five invariants?
  does this work PRESERVE the A→B transition's zero-code-touch promise?
  does this work put the BOUNDARY at the protocol, or inside a shared
    filesystem / in-process trick?

  if any answer is "no"· this is drift · stop · ask "what's the
    protocol-shaped version of what I want to do?"
```

## One-line doctrine

> The collocation is a deployment convenience, not an architectural
> commitment. Stratum talks to keel over the wire today so it can talk
> to keel over the wire tomorrow — without noticing the difference.
