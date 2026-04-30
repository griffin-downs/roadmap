# examples/

Minimal specs to learn the protocol from. Each one compiles to a DAG you can `roadmap make` and step through.

| Spec | Shape | Demonstrates |
|---|---|---|
| [hello.spec.json](hello.spec.json) | linear · 3 nodes | the smallest valid DAG |
| [parallel-build.spec.json](parallel-build.spec.json) | diamond · 5 nodes | parallel batches via `deps` |

Run any of them in a fresh directory:

```bash
mkdir my-test && cd my-test && git init -q
roadmap make /path/to/roadmap/examples/hello.spec.json --note "trying hello" --skip-input-verification
roadmap orient --note "begin"
# follow the produces; create the named files; advance node-by-node
```

The placeholder `0000…` sha256 in `inputs[]` requires `--skip-input-verification` on `make`. Real specs should hash the file actually being authored — see `roadmap api make` for the canonical schema.
