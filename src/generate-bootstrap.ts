// @module versioning
// @exports generateBootstrap, BootstrapOptions, BootstrapTemplate
// @types BootstrapOptions, BootstrapTemplate
// @entry roadmap/bootstrap

import fs from 'fs';
import path from 'path';

export type BootstrapTemplate = 'init' | 'monorepo' | 'multi-repo';

export interface BootstrapOptions {
  projectName: string;
  template: BootstrapTemplate;
  targetDir: string;
  force?: boolean;
}

/**
 * Generate roadmap.ts skeleton for a new project.
 */
export function generateBootstrap(options: BootstrapOptions): {
  roadmapTs: string;
  headJson: string;
  bootstrapMd: string;
} {
  const { projectName, template } = options;

  const roadmapTs = generateRoadmapTs(projectName, template);
  const headJson = generateHeadJson(projectName, template);
  const bootstrapMd = generateBootstrapMd(projectName, template);

  return { roadmapTs, headJson, bootstrapMd };
}

function generateRoadmapTs(name: string, template: BootstrapTemplate): string {
  const imports = `import { graph, define, orient, CompletionStore } from 'roadmap/protocol';`;

  let nodesDef = '';
  switch (template) {
    case 'init':
      nodesDef = `{
    scaffold: {
      id: 'scaffold',
      desc: 'Create initial files',
      produces: ['src/index.ts'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    },
    done: {
      id: 'done',
      desc: 'Ready to develop',
      produces: [],
      consumes: ['src/index.ts'],
      deps: ['scaffold'],
      validate: [],
      idempotent: false,
    },
  }`;
      break;
    case 'monorepo':
      nodesDef = `{
    setup: {
      id: 'setup',
      desc: 'Install dependencies',
      produces: ['node_modules/.bin/tsc'],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    },
    build: {
      id: 'build',
      desc: 'Build packages',
      produces: ['packages/*/dist'],
      consumes: ['node_modules/.bin/tsc'],
      deps: ['setup'],
      validate: [],
      idempotent: true,
    },
    shipped: {
      id: 'shipped',
      desc: 'Ready for production',
      produces: [],
      consumes: ['packages/*/dist'],
      deps: ['build'],
      validate: [],
      idempotent: false,
    },
  }`;
      break;
    case 'multi-repo':
      nodesDef = `{
    setup: {
      id: 'setup',
      desc: 'Check all repos ready',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    },
    deployed: {
      id: 'deployed',
      desc: 'Workspace deployed',
      produces: [],
      consumes: [],
      deps: ['setup'],
      validate: [],
      idempotent: false,
    },
  }`;
      break;
  }

  return `${imports}

const g = define(
  graph({
    id: '${name}',
    desc: 'Project roadmap',
    init: 'scaffold',
    term: 'done',
    nodes: ${nodesDef},
  }),
);

const pos = orient(g, CompletionStore.loadOrEmpty(process.cwd()));
console.log(\`Position: \${pos.position}\`);
console.log(\`Done: \${pos.done.length}, Remaining: \${pos.remaining.length}\`);

export { g, pos };
`;
}

function generateHeadJson(name: string, template: BootstrapTemplate): string {
  if (template === 'monorepo') {
    const graph = {
      id: name,
      desc: `${name} project roadmap`,
      init: 'setup',
      term: 'shipped',
      nodes: {
        setup: {
          id: 'setup',
          desc: 'Install dependencies',
          produces: ['node_modules/.bin/tsc'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'node_modules/.bin/tsc' }],
          idempotent: true,
        },
        build: {
          id: 'build',
          desc: 'Build packages',
          produces: ['packages/*/dist'],
          consumes: ['node_modules/.bin/tsc'],
          deps: ['setup'],
          validate: [],
          idempotent: true,
        },
        shipped: {
          id: 'shipped',
          desc: 'Ready for production',
          produces: [],
          consumes: ['packages/*/dist'],
          deps: ['build'],
          validate: [],
          idempotent: false,
        },
      },
    };
    return JSON.stringify(graph, null, 2);
  }

  if (template === 'multi-repo') {
    const graph = {
      id: name,
      desc: `${name} project roadmap`,
      init: 'setup',
      term: 'deployed',
      nodes: {
        setup: {
          id: 'setup',
          desc: 'Check all repos ready',
          produces: [],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: true,
        },
        deployed: {
          id: 'deployed',
          desc: 'Workspace deployed',
          produces: [],
          consumes: [],
          deps: ['setup'],
          validate: [],
          idempotent: false,
        },
      },
    };
    return JSON.stringify(graph, null, 2);
  }

  // Default: init template
  const graph = {
    id: name,
    desc: `${name} project roadmap`,
    init: 'scaffold',
    term: 'done',
    nodes: {
      scaffold: {
        id: 'scaffold',
        desc: 'Initial state',
        produces: ['src/index.ts'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
        idempotent: true,
      },
      done: {
        id: 'done',
        desc: 'Ready to develop',
        produces: [],
        consumes: ['src/index.ts'],
        deps: ['scaffold'],
        validate: [],
        idempotent: false,
      },
    },
  };

  return JSON.stringify(graph, null, 2);
}

function generateBootstrapMd(name: string, template: BootstrapTemplate): string {
  return `# ${name} Roadmap Bootstrap

Generated by \`roadmap bootstrap --template ${template}\`.

## Next Steps

1. **Define your DAG**: edit \`roadmap.ts\` to add nodes representing your project phases
2. **Run roadmap**: \`npx ts-node roadmap.ts\` to view orientation
3. **Execute phases**: implement your nodes, then run again to advance

## Project Structure

- \`roadmap.ts\` — DAG definition (TypeScript)
- \`.roadmap/head.json\` — DAG state (JSON)
- \`.roadmap/trail.jsonl\` — Execution history (JSONL)

## Template: ${template}

${getTemplateNotes(template)}

## Resources

- **[SKILL.md](../SKILL.md)** — Full API reference
- **[README.md](../README.md)** — Quick start + examples
- **[docs/MODULE-MAP.md](../docs/MODULE-MAP.md)** — Module reference
`;
}

function getTemplateNotes(template: BootstrapTemplate): string {
  switch (template) {
    case 'init':
      return 'Simple single-project roadmap. Suitable for standalone packages.';
    case 'monorepo':
      return 'Multi-package roadmap. Packages build in sequence (setup → build all → ship).';
    case 'multi-repo':
      return 'Cross-repo coordination. Use \`merge()\` to combine independent repo roadmaps.';
  }
}

/**
 * Validate bootstrap options and target directory.
 */
export function validateBootstrapOptions(options: BootstrapOptions): string[] {
  const errors: string[] = [];

  if (!options.projectName || options.projectName.trim() === '') {
    errors.push('Project name is required');
  }

  if (!options.targetDir || options.targetDir.trim() === '') {
    errors.push('Target directory is required');
  } else {
    const exists = fs.existsSync(options.targetDir);
    if (!exists) {
      errors.push(`Target directory does not exist: ${options.targetDir}`);
    }

    if (!options.force) {
      const roadmapExists = fs.existsSync(path.join(options.targetDir, 'roadmap.ts'));
      if (roadmapExists) {
        errors.push('roadmap.ts already exists (use --force to overwrite)');
      }
    }
  }

  if (!['init', 'monorepo', 'multi-repo'].includes(options.template)) {
    errors.push(`Invalid template: ${options.template}`);
  }

  return errors;
}
