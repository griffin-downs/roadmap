// @module cli
// @description CLI shim · re-imports bin/roadmap.ts so `npx tsx src/cli.ts ...` works
//              from any installer/validator that doesn't know about bin/.
// @exports (none — side-effect import runs the CLI)

import '../bin/roadmap.ts';
