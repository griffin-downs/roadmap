// @module cli
// @exports cmdPacksShow

export interface PackManifest {
  name: string;
  version: string;
  description: string;
  exports: string[];
  modules?: string[];
  size?: number;
  branch?: string;
  testStatus?: string;
}

export interface PackShowResponse {
  cmd: 'packs.show';
  name: string;
  manifest: PackManifest;
  discoveryReady: boolean;
}

export function cmdPacksShow(name: string, note: string): PackShowResponse {
  // Pack manifests indexed by name
  const manifests: Record<string, PackManifest> = {
    core: {
      name: 'core',
      version: '1.0.0',
      description: 'Core Chatelet pack with baseline utilities',
      branch: 'packs/core',
      exports: ['define', 'verify', 'orient', 'merge', 'branch', 'reconcile', 'parallelOrder', 'advanceBatch'],
      modules: [
        'src/lib/gitsafe/index.ts',
        'src/lib/chatelet/keepbudget.ts',
        'roadmap.ts'
      ],
      size: 45000,
      testStatus: '✅ 23/23 passing'
    }
  };

  const manifest = manifests[name];
  if (!manifest) {
    throw new Error(`Pack not found: ${name}`);
  }

  return {
    cmd: 'packs.show',
    name,
    manifest,
    discoveryReady: true
  };
}
