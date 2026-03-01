// Tests for src/lib/metaflow/authority.ts
// Covers: write→read round-trip, treeSha mismatch, UNGOVERNED_REPO error

import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import {
  readAuthority,
  writeAuthority,
  verifyTreeSha,
  getTreeSha,
  requireAuthority,
  AuthorityError,
} from "../../src/lib/metaflow/authority.ts";
import type { AuthorityJson } from "../../src/lib/metaflow/authority.ts";

function makeTmpRepo(): string {
  const dir = join(
    tmpdir(),
    `authority-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
  // initial commit so HEAD^{tree} resolves
  writeFileSync(join(dir, "README"), "test");
  execSync("git add README", { cwd: dir, stdio: "pipe" });
  execSync("git commit -m init", { cwd: dir, stdio: "pipe" });
  return dir;
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("authority helpers", () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpRepo();
  });

  it("write → read round-trip preserves all fields", () => {
    const treeSha = getTreeSha(root);
    const auth: AuthorityJson = {
      kernel: "roadmap",
      stage: 0,
      treeSha,
      since: new Date().toISOString(),
      receipt: ".roadmap/receipts/test-receipt.json",
    };

    writeAuthority(root, auth);
    const loaded = readAuthority(root);

    expect(loaded).not.toBeNull();
    expect(loaded!.kernel).toBe("roadmap");
    expect(loaded!.stage).toBe(0);
    expect(loaded!.treeSha).toBe(treeSha);
    expect(loaded!.receipt).toBe(auth.receipt);

    cleanup(root);
  });

  it("verifyTreeSha returns true when treeSha matches HEAD^{tree}", () => {
    const treeSha = getTreeSha(root);
    const auth: AuthorityJson = {
      kernel: "roadmap",
      stage: 1,
      treeSha,
      since: new Date().toISOString(),
      receipt: ".roadmap/receipts/r.json",
    };

    writeAuthority(root, auth);
    expect(verifyTreeSha(root, auth)).toBe(true);

    cleanup(root);
  });

  it("verifyTreeSha returns false when treeSha is stale", () => {
    const oldTreeSha = getTreeSha(root);
    const auth: AuthorityJson = {
      kernel: "roadmap",
      stage: 0,
      treeSha: oldTreeSha,
      since: new Date().toISOString(),
      receipt: ".roadmap/receipts/r.json",
    };

    writeAuthority(root, auth);

    // Mutate the tree by adding a new commit
    writeFileSync(join(root, "EXTRA"), "extra file");
    execSync("git add EXTRA", { cwd: root, stdio: "pipe" });
    execSync("git commit -m 'add extra'", { cwd: root, stdio: "pipe" });

    const newTreeSha = getTreeSha(root);
    expect(newTreeSha).not.toBe(oldTreeSha);
    expect(verifyTreeSha(root, auth)).toBe(false);

    cleanup(root);
  });

  it("readAuthority returns null when authority.json is absent (UNGOVERNED)", () => {
    const result = readAuthority(root);
    expect(result).toBeNull();
    cleanup(root);
  });

  it("requireAuthority throws UNGOVERNED_REPO when authority absent", () => {
    expect(() => requireAuthority(root)).toThrowError(AuthorityError);
    try {
      requireAuthority(root);
    } catch (e) {
      expect((e as AuthorityError).code).toBe("UNGOVERNED_REPO");
    }
    cleanup(root);
  });

  it("readAuthority throws AUTHORITY_MALFORMED on corrupt file", () => {
    const govDir = join(root, ".governance");
    mkdirSync(govDir, { recursive: true });
    writeFileSync(
      join(govDir, "authority.json"),
      JSON.stringify({ bad: true }),
    );

    expect(() => readAuthority(root)).toThrowError(AuthorityError);
    try {
      readAuthority(root);
    } catch (e) {
      expect((e as AuthorityError).code).toBe("AUTHORITY_MALFORMED");
    }
    cleanup(root);
  });
});
