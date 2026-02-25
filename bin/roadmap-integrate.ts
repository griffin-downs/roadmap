#!/usr/bin/env node

/**
 * roadmap integrate — CLI entrypoint
 *
 * Usage:
 *   roadmap integrate [options]
 *
 * Options:
 *   --dry-run              Show generated roadmap without writing
 *   --force                Overwrite existing roadmap.ts
 *   --output DIR           Output directory (default: cwd)
 *   --help                 Show this message
 *
 * Examples:
 *   roadmap integrate                    # Auto-detect and generate
 *   roadmap integrate --dry-run          # Preview
 *   roadmap integrate --force             # Overwrite existing
 */

import { readProjectMetadata } from '../src/project-metadata.schema';
import { requireProjectMetadata } from '../src/project-detector';
import { discoverBuildProcess } from '../src/build-discoverer';
import { discoverDependencies } from '../src/dependency-resolver';
import { generateRoadmapDAG, validateGeneratedDAG } from '../src/auto-integrate-gen';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface CLIOptions {
  dryRun: boolean;
  force: boolean;
  outputDir: string;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const opts: CLIOptions = {
    dryRun: false,
    force: false,
    outputDir: process.cwd(),
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--output') opts.outputDir = process.argv[++i];
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return opts;
}

function showHelp() {
  console.log(`
roadmap integrate — Auto-generate project roadmap

Usage:
  roadmap integrate [options]

Options:
  --dry-run              Show generated roadmap without writing
  --force                Overwrite existing roadmap.ts
  --output DIR           Output directory (default: cwd)
  --help                 Show this message

Examples:
  roadmap integrate                    # Auto-detect and generate
  roadmap integrate --dry-run          # Preview
  roadmap integrate --force             # Overwrite existing

Description:
  Discovers your project structure (package.json, build config, dependencies)
  and generates a minimal 3-node roadmap: init → build → term.

  The generated roadmap passes all validation checks and can be extended
  with additional phases using reconcile().
`);
}

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  try {
    console.log('🔍 Detecting project metadata...');
    const repoRoot = opts.outputDir;

    // Require project metadata
    await requireProjectMetadata(repoRoot);
    const metadata = await readProjectMetadata(repoRoot);
    if (!metadata) {
      throw new Error('Failed to read project metadata');
    }

    console.log(`✓ Found project: ${metadata.projectType}`);

    // Discover build process
    console.log('🔍 Discovering build process...');
    const buildProc = await discoverBuildProcess(repoRoot);
    const buildCommand = buildProc?.command || metadata.buildCommand || 'npm run build';
    console.log(`✓ Build command: ${buildCommand}`);

    // Discover dependencies (optional)
    console.log('🔍 Discovering dependencies...');
    const deps = await discoverDependencies(repoRoot);
    console.log(`✓ Found ${deps.length} dependencies`);

    // Generate roadmap
    console.log('🔨 Generating roadmap.ts...');
    const projectId = metadata.projectType.toLowerCase().replace(/\W+/g, '-') || 'project';
    const { sourceCode, dag } = generateRoadmapDAG(projectId, metadata, buildCommand);

    // Validate
    const validation = validateGeneratedDAG(dag);
    if (!validation.valid) {
      throw new Error(`Generated DAG validation failed:\n${validation.errors.join('\n')}`);
    }
    console.log('✓ Validation passed');

    // Show or write
    if (opts.dryRun) {
      console.log('\n=== Generated roadmap.ts ===\n');
      console.log(sourceCode);
      console.log('\n=== End of generated roadmap ===\n');
      console.log('ℹ️  Use --force to write to disk');
    } else {
      const roadmapPath = join(repoRoot, 'roadmap.ts');
      if (existsSync(roadmapPath) && !opts.force) {
        console.error(`✗ roadmap.ts already exists. Use --force to overwrite.`);
        process.exit(1);
      }

      writeFileSync(roadmapPath, sourceCode);
      console.log(`✓ Wrote: ${roadmapPath}`);

      // Create .roadmap/head.json metadata
      const headPath = join(repoRoot, '.roadmap', 'head.json');
      const headContent = {
        id: projectId,
        desc: `Project roadmap for ${projectId}`,
        init: 'init',
        term: 'term',
        nodes: dag.nodes,
      };

      try {
        const fs = await import('node:fs/promises');
        await fs.mkdir(join(repoRoot, '.roadmap'), { recursive: true });
        await fs.writeFile(headPath, JSON.stringify(headContent, null, 2));
        console.log(`✓ Wrote: ${headPath}`);
      } catch (e) {
        console.warn(`⚠️  Could not write metadata: ${e instanceof Error ? e.message : String(e)}`);
      }

      console.log('\n✓ Integration complete!');
      console.log('\nNext steps:');
      console.log('  1. Review roadmap.ts');
      console.log('  2. Commit: git add roadmap.ts .roadmap/ && git commit -m "feat: roadmap"');
      console.log('  3. Check position: node roadmap.ts --position');
      console.log('  4. Execute: Create artifacts listed in "produces" section');
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`\n✗ Error: ${message}`);
    process.exit(1);
  }
}

main().catch(console.error);
