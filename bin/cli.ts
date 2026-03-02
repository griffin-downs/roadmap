#!/usr/bin/env node
// CLI entrypoint - use unified registry

import { initializeCliRegistry } from '../src/cli/registry.js';

const program = initializeCliRegistry();
program.parse(process.argv);
