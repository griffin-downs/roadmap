// @module lib/version
// @exports readPackageVersion

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Walk up from this file to find package.json and read its `version`. */
export function readPackageVersion(): string {
  let dir = resolve(import.meta.dirname || __dirname);
  for (let i = 0; i < 5; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      const data = JSON.parse(readFileSync(pkg, 'utf-8')) as { version?: string };
      return data.version ?? '0.0.0';
    }
    dir = resolve(dir, '..');
  }
  return '0.0.0';
}
