// boot.ts — session entry gate
//
// Verifies reorientation before any work proceeds.
// Produces .boot/session-receipt.json on success (gitignored).
// orient() positions at 'reorient' until this file exists.
// All pending DAG nodes depend on 'reorient' — nothing executes without a valid boot.
//
// Run: node --experimental-strip-types boot.ts
// Exit 0: ready, receipt written, position and mode presented.
// Exit 1: checks failed, receipt not written, do not proceed.

import { orient } from './src/protocol.ts';
import roadmap from './roadmap.ts';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const errors: string[] = [];

function ok(label: string) { console.log(`  ok  ${label}`); }
function err(label: string, detail: string) {
  console.error(`  ERR ${label}: ${detail}`);
  errors.push(`${label}: ${detail}`);
}

console.log('\nboot: reorientation checks');
console.log('─'.repeat(40));

// 1. orientation.md exists
existsSync(join(root, 'orientation.md'))
  ? ok('orientation.md exists')
  : err('orientation.md', 'not found — cannot proceed without it');

// 2. PROMPT.md exists
existsSync(join(root, 'PROMPT.md'))
  ? ok('PROMPT.md exists')
  : err('PROMPT.md', 'not found');

// 3. orient() returns a known node
const o = orient(roadmap, a => existsSync(join(root, a)));
const knownNodes = Object.keys(roadmap.nodes);
knownNodes.includes(o.position)
  ? ok(`orient() position: ${o.position}`)
  : err('orient()', `unknown position "${o.position}"`);

// 4. Done nodes' produces all exist on disk
for (const id of o.done) {
  const node = (roadmap.nodes as Record<string, { produces: readonly string[] }>)[id];
  for (const artifact of node.produces) {
    existsSync(join(root, artifact))
      ? ok(`  ${id} → ${artifact}`)
      : err(`done node ${id}`, `artifact missing: ${artifact}`);
  }
}

// 5. Git state (best-effort)
let gitClean = false;
let gitHead: string | null = null;
const dirtyFiles: string[] = [];
try {
  gitHead = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  gitClean = status === '';
  if (!gitClean) status.split('\n').forEach(l => dirtyFiles.push(l.trim()));
  ok(`git ${gitClean ? 'clean' : `dirty (${dirtyFiles.length} file${dirtyFiles.length > 1 ? 's' : ''})`}`);
  if (!gitClean) dirtyFiles.forEach(f => console.log(`       ${f}`));
} catch {
  ok('git unavailable (skipped)');
}

if (errors.length) {
  console.error(`\nboot: FAILED — ${errors.length} error${errors.length > 1 ? 's' : ''}`);
  errors.forEach(e => console.error(`  • ${e}`));
  process.exit(1);
}

// Write receipt — creating this file is what advances orient() past 'reorient'
mkdirSync(join(root, '.boot'), { recursive: true });
writeFileSync(join(root, '.boot/session-receipt.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  position: o.position,
  done: o.done,
  remaining: o.remaining,
  gitClean,
  gitHead,
  dirtyFiles,
}, null, 2));

console.log('─'.repeat(40));
console.log(`\nboot: ok`);
console.log(`\nposition : ${o.position}`);
console.log(`done     : ${o.done.join(', ') || '(none)'}`);
console.log(`remaining: ${o.remaining.join(', ')}`);
console.log(`git      : ${gitClean ? 'clean' : `dirty — ${dirtyFiles.length} file(s)`}`);
console.log(`\nChoose execution mode:`);
console.log(`  [1] semi — next phase group, stop and present results + options`);
console.log(`  [2] full — all remaining phases to term`);
