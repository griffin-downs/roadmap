// @module cli/init
// @description Emit setup instructions as JSON. The `setup_doc` field carries the
//              full markdown of docs/SETUP.md so an agent (or `jq -r .data.setup_doc`)
//              can paste it into context. No human-format stdout — the envelope is
//              the surface.
// @exports run

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';

function findSetupDoc(): string {
  const here = dirname(new URL(import.meta.url).pathname);
  const candidates = [
    join(here, '..', '..', 'docs', 'SETUP.md'),
    join(here, '..', 'docs', 'SETUP.md'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return '';
}

export async function run(
  _args: string[],
  _repoRoot: string,
  _note: string,
  outputOpts: OutputOpts,
): Promise<void> {
  const doc = findSetupDoc();
  const data = doc
    ? { setup_doc_path: doc, setup_doc: readFileSync(doc, 'utf-8') }
    : { setup_doc_path: null, setup_doc: null, hint: 'See https://github.com/Ocean-Synaptics/roadmap/blob/main/docs/SETUP.md' };
  emit({ ok: true, cmd: outputOpts.cmd, data }, outputOpts);
}
