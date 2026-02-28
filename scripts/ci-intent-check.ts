#!/usr/bin/env npx tsx
// wip-lane-policy: WIP commit detection gate.
// Scans commit range (merge-base..HEAD) for WIP markers.
// Fails if any WIP commit targets a protected branch (default: master).
//
// WIP detection rule:
//   - subject starts with "wip:" (case-insensitive)
//   - commit message contains footer line "Intent: WIP"
//
// ENV:
//   GITHUB_BASE_REF — PR base branch (set by Actions on pull_request)
//   GITHUB_SHA      — current HEAD
//   PROTECTED_BRANCH — branch name that rejects WIP (default: master)
//
// stdout: JSON { ok, wip_commits[], range, base, head }

import { execSync } from 'child_process';

const protectedBranch = process.env.PROTECTED_BRANCH || 'master';
const baseRef = process.env.GITHUB_BASE_REF;
const headSha = process.env.GITHUB_SHA || execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

if (!baseRef) {
  process.stdout.write(JSON.stringify({ ok: true, skipped: true, reason: 'GITHUB_BASE_REF not set — not a PR context' }) + '\n');
  process.exit(0);
}

// merge-base for accurate range even with merge commits
let mergeBase: string;
try {
  mergeBase = execSync(`git merge-base origin/${baseRef} ${headSha}`, { encoding: 'utf-8' }).trim();
} catch {
  // fallback: fetch base and retry
  try {
    execSync(`git fetch origin ${baseRef} --depth=50`, { stdio: 'pipe' });
    mergeBase = execSync(`git merge-base origin/${baseRef} ${headSha}`, { encoding: 'utf-8' }).trim();
  } catch (e: any) {
    process.stdout.write(JSON.stringify({ ok: false, error: `Cannot compute merge-base: ${e.message}` }) + '\n');
    process.exit(1);
  }
}

const range = `${mergeBase}..${headSha}`;

// get commits in range: hash + full message
const rawLog = execSync(`git log ${range} --format=%H%x00%B%x00`, { encoding: 'utf-8' });

type WipCommit = { sha: string; subject: string; rule: string };
const wipCommits: WipCommit[] = [];

for (const block of rawLog.split('\0\0')) {
  const trimmed = block.trim();
  if (!trimmed) continue;
  const sepIdx = trimmed.indexOf('\0');
  if (sepIdx === -1) continue;
  const sha = trimmed.slice(0, sepIdx);
  const message = trimmed.slice(sepIdx + 1);
  const subject = message.split('\n')[0];

  if (/^wip:/i.test(subject)) {
    wipCommits.push({ sha: sha.slice(0, 8), subject, rule: 'subject:wip:' });
  } else if (/^Intent:\s*WIP$/m.test(message)) {
    wipCommits.push({ sha: sha.slice(0, 8), subject, rule: 'footer:Intent:WIP' });
  }
}

const isProtected = baseRef === protectedBranch;
const ok = !isProtected || wipCommits.length === 0;

const result = {
  ok,
  wip_commits: wipCommits,
  range,
  base: baseRef,
  head: headSha.slice(0, 8),
  ...(wipCommits.length > 0 && isProtected
    ? { reason: `${wipCommits.length} WIP commit(s) in PR targeting ${protectedBranch}` }
    : {}),
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(ok ? 0 : 1);
