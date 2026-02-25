/**
 * Project metadata schema: .roadmap.json
 *
 * Enables autonomous integration: agent reads metadata, no guessing needed.
 */

// Project type: user-defined string, no built-in list
// User describes their project however they want
export type ProjectType = string;

export interface PhaseSpec {
  readonly id: string;
  readonly desc: string;
  readonly automatic: boolean;        // Can run autonomously?
  readonly command?: string;          // How to execute
  readonly reviewer?: string;         // Who reviews (if automatic=false)
  readonly produces?: readonly string[];
  readonly consumes?: readonly string[];
}

export interface DependencySpec {
  readonly repo: string;              // Relative path or URL
  readonly consumes: readonly string[];
  readonly phase: string;             // "init", "build", etc
  readonly mustComplete?: boolean;    // Block if not complete?
}

export interface ProjectMetadata {
  readonly projectType: ProjectType;
  readonly init: readonly string[];   // What exists now
  readonly term: readonly string[];   // What should exist
  readonly buildCommand?: string;     // Primary build command
  readonly phases?: readonly PhaseSpec[];
  readonly dependencies?: readonly DependencySpec[];
}

/**
 * Validate metadata structure
 */
export function validateProjectMetadata(m: unknown): m is ProjectMetadata {
  if (!m || typeof m !== 'object') return false;
  const metadata = m as Record<string, unknown>;

  return (
    typeof metadata.projectType === 'string' &&
    Array.isArray(metadata.init) &&
    Array.isArray(metadata.term) &&
    (metadata.init as any[]).every(x => typeof x === 'string') &&
    (metadata.term as any[]).every(x => typeof x === 'string') &&
    (!metadata.buildCommand || typeof metadata.buildCommand === 'string') &&
    (!metadata.phases || Array.isArray(metadata.phases))
  );
}

/**
 * Read .roadmap.json from project root
 */
export async function readProjectMetadata(repoRoot: string): Promise<ProjectMetadata | null> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    const content = await readFile(join(repoRoot, '.roadmap.json'), 'utf-8');
    const parsed = JSON.parse(content);
    return validateProjectMetadata(parsed) ? parsed : null;
  } catch {
    return null;  // File doesn't exist or invalid
  }
}

/**
 * Write .roadmap.json to project root
 */
export async function writeProjectMetadata(repoRoot: string, metadata: ProjectMetadata): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await writeFile(join(repoRoot, '.roadmap.json'), JSON.stringify(metadata, null, 2) + '\n');
}

/**
 * Check metadata validity (sanity checks)
 */
export function validateMetadataConsistency(metadata: ProjectMetadata): string[] {
  const errors: string[] = [];

  // Init and term must not be identical
  if (JSON.stringify(metadata.init.sort()) === JSON.stringify(metadata.term.sort())) {
    errors.push('init and term must differ');
  }

  // Build command should exist (basic heuristic)
  if (metadata.buildCommand && !metadata.buildCommand.includes('npm') && !metadata.buildCommand.includes('make')) {
    // Could be other build systems, so this is just a heuristic warning
  }

  // Phases must have unique IDs
  if (metadata.phases) {
    const ids = metadata.phases.map(p => p.id);
    const unique = new Set(ids);
    if (ids.length !== unique.size) {
      errors.push('Phase IDs must be unique');
    }
  }

  // Dependencies must reference valid repos
  if (metadata.dependencies) {
    for (const dep of metadata.dependencies) {
      if (!dep.repo || !Array.isArray(dep.consumes)) {
        errors.push(`Invalid dependency: ${JSON.stringify(dep)}`);
      }
    }
  }

  return errors;
}

/**
 * Merge metadata with auto-detected fallbacks
 */
export function mergeWithDefaults(metadata: Partial<ProjectMetadata>): ProjectMetadata {
  return {
    projectType: metadata.projectType || 'generic',
    init: metadata.init || [],
    term: metadata.term || [],
    buildCommand: metadata.buildCommand,
    phases: metadata.phases,
    dependencies: metadata.dependencies,
  };
}
