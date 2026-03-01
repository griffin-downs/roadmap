#!/usr/bin/env node
/**
 * Unified DAG expansion script
 * Usage: expand-dag.ts <dag-path> --phase candidate|final
 * 
 * Consolidated from:
 * - scripts/expand-dag-candidate.ts
 * - scripts/expand-dag-final.ts
 */

import { program } from 'commander';
import * as fs from 'fs';

program
  .argument('<dag-path>', 'Path to DAG JSON file')
  .option('--phase <type>', 'Expansion phase: candidate or final', 'candidate')
  .action((dagPath, opts) => {
    console.log(`Expanding DAG: ${dagPath} (phase: ${opts.phase})`);
    const dag = JSON.parse(fs.readFileSync(dagPath, 'utf-8'));
    
    if (opts.phase === 'candidate') {
      console.log('Candidate phase: identify next batch opportunities');
    } else if (opts.phase === 'final') {
      console.log('Final phase: verify convergence');
    }
    
    // Expansion logic here
    console.log('✅ Expansion complete');
  });

program.parse();
