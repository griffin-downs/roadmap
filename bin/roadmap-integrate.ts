#!/usr/bin/env node

/**
 * CLI: roadmap integrate
 * Auto-detect project metadata and bootstrap roadmap
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateRoadmapDAG, validateGeneratedDAG } from '../src/auto-integrate-gen.ts';
import { planIntegration } from '../src/auto-integrate.ts';
import type { ProjectMetadata } from '../src/project-metadata.schema.ts';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const auto = args.includes('--auto') || !args.includes('--guided');

async function main() {
  console.log('🚀 Roadmap Integration');

  try {
    // Step 1: Plan integration
    console.log('\n1️⃣  Analyzing project...');
    const plan = await planIntegration(repoRoot);
    console.log(`   ✓ Type: ${plan.metadata.projectType}`);
    console.log(`   ✓ Build: ${plan.buildProcess}`);
    console.log(`   ✓ Dependencies: ${plan.dependencies.length}`);

    // Step 2: Generate DAG
    console.log('\n2️⃣  Generating roadmap...');
    const generatedDAG = generateRoadmapDAG(repoRoot, plan.metadata, plan.buildProcess);
    console.log(`   ✓ Nodes: ${Object.keys(generatedDAG.dag.nodes).length}`);

    // Step 3: Validate
    console.log('\n3️⃣  Validating...');
    const validation = validateGeneratedDAG(generatedDAG.dag);
    if (!validation.valid) {
      console.error('   ✗ Validation failed:');
      validation.errors.forEach(e => console.error(`     - ${e}`));
      process.exit(1);
    }
    console.log('   ✓ Valid DAG');

    // Step 4: Write files
    if (!dryRun) {
      console.log('\n4️⃣  Writing files...');
      writeFileSync(
        join(repoRoot, '.roadmap', 'head.json'),
        JSON.stringify(generatedDAG, null, 2) + '\n'
      );
      console.log('   ✓ .roadmap/head.json');
    } else {
      console.log('\n4️⃣  (Dry-run: skipping file write)');
    }

    // Step 5: Install git hooks
    if (!dryRun) {
      console.log('\n5️⃣  Installing git hooks...');
      try {
        // Import and run install-hooks
        const { execSync } = require('child_process');
        execSync('npx ts-node bin/install-hooks.ts', {
          cwd: repoRoot,
          stdio: 'inherit',
        });
      } catch (err) {
        console.warn('   ⚠️  Hook installation failed (non-fatal)');
      }
    }

    console.log('\n✅ Integration ready!');
    console.log(`   Next: roadmap orient --note "bootstrap"`);

  } catch (err) {
    console.error('❌ Integration failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
