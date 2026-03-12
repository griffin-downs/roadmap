// @module runtime/fleet
// @description Cross-repo fleet context loading — reads fleet.json, calls loadContext() per repo
// @exports FleetContext, FleetRepoContext, loadFleetContext
// @entry roadmap

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

import { parseFleetManifest, type FleetManifest, type FleetRepoEntry } from '../lib/fleet-types.ts';
import { loadContext, type Context } from './context.ts';

export interface FleetRepoContext {
  readonly entry: FleetRepoEntry;
  readonly resolvedPath: string;
  readonly context: Context | null;
  readonly warning: string | null;
}

export interface FleetContext {
  readonly manifest: FleetManifest;
  readonly compilerRoot: string;
  readonly compilerContext: Context;
  readonly repos: readonly FleetRepoContext[];
}

function resolvePath(raw: string, compilerRoot: string): string {
  if (raw.startsWith('~/')) return join(homedir(), raw.slice(2));
  if (raw.startsWith('/')) return raw;
  return resolve(compilerRoot, raw);
}

/** Load fleet context from .roadmap/fleet.json in the compiler repo */
export function loadFleetContext(compilerRoot: string): FleetContext {
  const fleetPath = join(compilerRoot, '.roadmap', 'fleet.json');
  if (!existsSync(fleetPath)) {
    throw new Error(`No fleet.json found at ${fleetPath}`);
  }

  const raw = JSON.parse(readFileSync(fleetPath, 'utf-8'));
  const manifest = parseFleetManifest(raw);

  const compilerContext = loadContext(compilerRoot);

  const repos: FleetRepoContext[] = manifest.repos.map(entry => {
    const resolvedPath = resolvePath(entry.path, compilerRoot);

    if (!existsSync(resolvedPath)) {
      return { entry, resolvedPath, context: null, warning: `repo not found: ${resolvedPath}` };
    }

    const headPath = join(resolvedPath, '.roadmap', 'head.json');
    if (!existsSync(headPath)) {
      return { entry, resolvedPath, context: null, warning: `no .roadmap/head.json in ${resolvedPath}` };
    }

    try {
      const context = loadContext(resolvedPath);
      return { entry, resolvedPath, context, warning: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { entry, resolvedPath, context: null, warning: `failed to load context: ${msg}` };
    }
  });

  return { manifest, compilerRoot, compilerContext, repos };
}
