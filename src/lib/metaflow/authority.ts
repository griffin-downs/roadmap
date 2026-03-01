// @module metaflow/authority
// @exports readAuthority, writeAuthority, verifyTreeSha, getTreeSha, AuthorityError
// @entry roadmap/metaflow

// Authority marker helpers for .governance/authority.json.
// Absence of the file = UNGOVERNED state: only `metaflow init` is permitted.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  type AuthorityJson,
  isAuthorityJson,
  AUTHORITY_PATH,
  GOVERNANCE_DIR,
} from "./authority-schema.ts";

export { type AuthorityJson } from "./authority-schema.ts";

// --- Error ---

export class AuthorityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthorityError";
  }
}

// --- Helpers ---

function authorityPath(root: string): string {
  return join(root, AUTHORITY_PATH);
}

function governanceDir(root: string): string {
  return join(root, GOVERNANCE_DIR);
}

/** Run git rev-parse HEAD^{tree} in root. Returns the tree SHA. */
export function getTreeSha(root: string): string {
  return execSync("git rev-parse HEAD^{tree}", {
    cwd: root,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

// --- Core ---

/**
 * Read .governance/authority.json.
 * Returns null if absent (UNGOVERNED state) — never throws on missing file.
 */
export function readAuthority(root: string): AuthorityJson | null {
  const p = authorityPath(root);
  if (!existsSync(p)) return null;
  const raw = JSON.parse(readFileSync(p, "utf-8"));
  if (!isAuthorityJson(raw)) {
    throw new AuthorityError(
      "AUTHORITY_MALFORMED",
      `${AUTHORITY_PATH} exists but does not match AuthorityJson schema`,
    );
  }
  return raw;
}

/**
 * Write .governance/authority.json atomically.
 * Creates .governance/ directory if absent.
 */
export function writeAuthority(root: string, auth: AuthorityJson): void {
  mkdirSync(governanceDir(root), { recursive: true });
  writeFileSync(authorityPath(root), JSON.stringify(auth, null, 2) + "\n");
}

/**
 * Compare stored treeSha in auth with the live git HEAD^{tree}.
 * Returns true only if they match.
 */
export function verifyTreeSha(root: string, auth: AuthorityJson): boolean {
  let live: string;
  try {
    live = getTreeSha(root);
  } catch {
    return false;
  }
  return live === auth.treeSha;
}

/**
 * Assert authority is present. Throws UNGOVERNED_REPO if absent.
 * Use at the top of every governed command.
 */
export function requireAuthority(root: string): AuthorityJson {
  const auth = readAuthority(root);
  if (auth === null) {
    throw new AuthorityError(
      "UNGOVERNED_REPO",
      "No .governance/authority.json found. Run `roadmap metaflow init` first.",
    );
  }
  return auth;
}
