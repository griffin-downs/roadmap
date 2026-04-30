// @module cli/help
// @description Emit the command summary as JSON. No human-format stdout — agents
//              consume the envelope, the same shape as every other command.
//              Use `roadmap api --all` for full schemas.
// @exports run

import { emit, type OutputOpts } from '../lib/cli-envelope.ts';

const COMMAND_SUMMARY = {
  core: [
    { command: 'make <spec>', desc: 'Create ideal DAG from spec' },
    { command: 'orient', desc: 'Current batch position + produces/consumes' },
    { command: 'advance [node-id]', desc: 'Complete node (run validators, record evidence) or advance batch' },
    { command: 'init', desc: 'Emit setup instructions for adapting to your environment' },
    { command: 'viewer', desc: "Start the roadmap viewer dev server (host repo's .roadmap/)" },
  ],
  groups: [
    { command: 'dag <sub>', desc: 'DAG mutations: insert, remove, modify, log' },
  ],
  discovery: [
    { command: 'api [<command>]', desc: 'Schema discovery (input/output JSON Schema + examples + invariants)' },
    { command: 'api --all', desc: 'Full registry dump' },
    { command: 'help', desc: 'This envelope' },
  ],
  notes: [
    'all commands require --note "reason" (except help, orient, api)',
    'all output is JSON via the envelope shape { schema_version, ok, cmd, data | error }',
    'add --help to any command for its full schema',
  ],
};

export function run(outputOpts?: OutputOpts): void {
  emit({ ok: true, cmd: 'help', data: COMMAND_SUMMARY }, outputOpts ?? { cmd: 'help', quiet: false });
}
