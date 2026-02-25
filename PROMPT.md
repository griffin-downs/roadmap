# Session entry — roadmap/

Run boot.ts. It verifies orientation, confirms position, captures git state,
and writes `.boot/session-receipt.json`. If it exits non-zero, read the errors
and resolve before proceeding.

```bash
node --experimental-strip-types boot.ts
```

Read `orientation.md` for context on current position, constraints, and pending work.

Do not proceed until boot exits 0 and you have chosen a mode.
