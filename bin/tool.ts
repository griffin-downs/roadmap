#!/usr/bin/env node

// @module cli/tools
// @exports (CLI binary — tool entry point for Châtelet commands)
// @entry bin/tool

import { join } from 'node:path';
import { cmdChateletStatus, type StatusOptions } from '../src/cli/commands/chatelet-status.ts';

const argv = process.argv.slice(2);
const repoRoot = process.cwd();

async function main() {
  const [cmd, subCmd, ...args] = argv;

  if (!cmd) {
    console.error('Usage: tool <command> [subcommand] [options]');
    console.error('Commands: chatelet');
    process.exit(1);
  }

  if (cmd === 'chatelet') {
    if (!subCmd) {
      console.error('Usage: tool chatelet <subcommand> [options]');
      console.error('Subcommands: status');
      process.exit(1);
    }

    if (subCmd === 'status') {
      const options: StatusOptions = {};

      // Parse args for --check and --format flags
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--check') {
          options.check = true;
        } else if (args[i] === '--format') {
          if (i + 1 < args.length) {
            const format = args[i + 1] as 'text' | 'json';
            if (format === 'json' || format === 'text') {
              options.format = format;
              i++;
            }
          }
        }
      }

      try {
        await cmdChateletStatus(repoRoot, options);
      } catch (err) {
        // Error already printed by cmdChateletStatus
        process.exit(1);
      }
      return;
    }

    console.error(`Unknown subcommand: ${subCmd}`);
    console.error('Subcommands: status');
    process.exit(1);
  }

  console.error(`Unknown command: ${cmd}`);
  console.error('Commands: chatelet');
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
