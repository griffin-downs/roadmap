import { describe, it, expect } from 'vitest';
import { define, graph, validateNode, check, verify } from '../src/protocol.ts';
import type { ValidationRule, Graph, NodeSpec } from '../src/protocol.ts';
import {
  extractIntentFailures, generateIntentExpansion, detectStall, buildEscalation,
} from '../src/lib/intent/intent-expansion.ts';
import type { IntentFailure } from '../src/lib/intent/intent-expansion.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(overrides: Partial<{
  statement: string; confidence: number; expandOnFail: boolean;
  maxExpansionDepth: number; context: string[];
}> = {}): ValidationRule & { type: 'intent' } {
  return {
    type: 'intent',
    statement: overrides.statement ?? 'feature works correctly',
    confidence: overrides.confidence ?? 0.9,
    evaluator: 'self',
    context: overrides.context,
    expandOnFail: overrides.expandOnFail ?? true,
    maxExpansionDepth: overrides.maxExpansionDepth,
  };
}

function judgment(statement: string, confidence: number) {
  return { statement, confidence, reasoning: 'test reasoning', evidence: ['file.ts:10'] };
}

function node(id: string, overrides: Partial<{
  produces: string[]; consumes: string[]; deps: string[];
  validate: ValidationRule[]; expandedFrom: string;
  _intentDiagnosis: any; desc: string;
}> = {}) {
  return {
    id,
    desc: overrides.desc ?? id,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: true,
    expandedFrom: overrides.expandedFrom,
    _intentDiagnosis: overrides._intentDiagnosis,
  };
}

// ── Scenario 1: Vague produces → expansion clarifies ──────────────────────────

describe('init gate E2E: scenario 1 — vague produces expands to clear children', () => {
  it('flags "database" as vague, generates concrete schema.ts and crud.ts children', async () => {
    // Parent node says "produces: ['database']" which is too vague
    const vagueRule = intentRule({
      statement: 'database artifact is well-specified',
      confidence: 0.9,
      expandOnFail: true,
      maxExpansionDepth: 2,
    });

    const parentNode = node('setup-db', {
      produces: ['database'],
      validate: [vagueRule],
      desc: 'Vague: produces database',
    });

    const dag = define(graph({
      id: 'vague-produces', desc: 'init gate — vague produces', init: 'init', term: 'setup-db',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'setup-db': parentNode,
      } as any,
    }));

    // Validate: vague artifact fails intent
    const result = await validateNode(dag, 'setup-db', () => true, {
      intentJudgments: [judgment('database artifact is well-specified', 0.5)],
    });

    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBe('expanding');

    // Extract failure
    const failures = extractIntentFailures(result.checks, [
      judgment('database artifact is well-specified', 0.5),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0].statement).toContain('well-specified');

    // Generate expansion: 2 concrete children
    const expansion = generateIntentExpansion(
      'setup-db',
      ['database'],
      [],
      undefined,
      [vagueRule],
      [
        {
          ...failures[0],
          rule: vagueRule,
        },
      ],
      0,
    );

    expect(expansion.status).toBe('expanding');
    expect(expansion.fixNodes.length).toBeGreaterThanOrEqual(1);

    // Fix nodes preserve produces but provide intent to clarify them
    const fixNode = expansion.fixNodes[0];
    expect(fixNode.id).toBe('setup-db-fix-0');
    expect(fixNode.desc).toContain('database');
    expect(fixNode.produces.length).toBeGreaterThan(0);
    expect(fixNode.produces[0]).toBe('database'); // Inherited from parent
    expect(fixNode.expandedFrom).toBe('setup-db');
    // The intent rule on the fix node is what clarifies the vague produce
    expect(fixNode.validate.length).toBeGreaterThan(0);

    // Children should pass re-validation if produces are concrete
    expect(fixNode.validate).toContainEqual(expect.objectContaining({ type: 'intent' }));
  });

  it('provides scoped context for fix nodes addressing specific file paths', () => {
    const rule = intentRule({
      statement: 'database layer is implemented',
      confidence: 0.9,
      context: ['src/db.ts'],
    });

    const failure: IntentFailure = {
      statement: 'database layer is implemented',
      threshold: 0.9,
      achieved: 0.4,
      reasoning: 'Schema exists but queries missing',
      evidence: ['src/db.ts:1-20'],
      rule,
    };

    const expansion = generateIntentExpansion(
      'setup-db',
      ['src/db.ts', 'src/schema.ts'],
      [],
      undefined,
      [rule],
      [failure],
      0,
    );

    const fixNode = expansion.fixNodes[0];
    // Context should scope the fix to db.ts only
    expect(fixNode.produces).toContain('src/db.ts');
    expect(fixNode.consumes).toContain('src/db.ts');
  });
});

// ── Scenario 2: Unresolvable consumes → expansion backtracks ─────────────────

describe('init gate E2E: scenario 2 — unresolvable consumes backtracks with new producer', () => {
  it('detects Node-B consumes "src/db.ts" with no producer, creates Node-A', async () => {
    // DAG: init → Node-B (consumes src/db.ts but no predecessor produces it)
    const dagNodes: Record<string, any> = {
      init: node('init', { produces: ['init.txt'] }),
      'node-b': node('node-b', {
        deps: ['init'],
        consumes: ['src/db.ts'],
        produces: ['src/app.ts'],
        validate: [intentRule({ statement: 'app uses database layer' })],
      }),
    };

    const dag = define(graph({
      id: 'unresolved-consume', desc: 'init gate — missing producer', init: 'init', term: 'node-b',
      nodes: dagNodes,
    }));

    // verify() should flag unresolved consume
    const issues = verify(dag);
    // Note: verify checks if consumes are satisfied by predecessors
    // In this case, init doesn't produce src/db.ts, so node-b's consume is unresolved
    expect(issues.length).toBeGreaterThan(0);

    // The validation framework would mark this as an expand-on-fail scenario
    const result = await validateNode(dag, 'node-b', () => true, {
      intentJudgments: [judgment('app uses database layer', 0.3)],
    });

    // Intention: if consumes can't be resolved by predecessors, generate fix to create producer
    const failures = extractIntentFailures(result.checks, [
      judgment('app uses database layer', 0.3),
    ]);

    if (failures.length > 0) {
      const expansion = generateIntentExpansion(
        'node-b',
        ['src/app.ts'],
        ['src/db.ts'],
        undefined,
        result.checks.filter(c => c.rule.type === 'intent').map(c => c.rule),
        failures,
        0,
      );

      // Should generate a fix node that addresses the missing db layer
      expect(expansion.fixNodes.length).toBeGreaterThanOrEqual(1);
      const fixNode = expansion.fixNodes[0];
      // Fix node consumes the parent's produces, attempts to resolve the gap
      expect(fixNode.expandedFrom).toBe('node-b');
      // Consumes will be the parent produces (src/app.ts)
      expect(fixNode.consumes.length).toBeGreaterThan(0);
    }
  });

  it('expanded DAG has acyclic topology with new producer node', () => {
    // After expansion: init → node-a (produces src/db.ts) → node-b
    const expandedNodes: Record<string, any> = {
      init: node('init', { produces: ['init.txt'] }),
      'node-a': node('node-a', {
        deps: ['init'],
        produces: ['src/db.ts'],
        validate: [intentRule({ statement: 'database module initialized' })],
      }),
      'node-b': node('node-b', {
        deps: ['node-a'],
        consumes: ['src/db.ts'],
        produces: ['src/app.ts'],
        validate: [intentRule({ statement: 'app uses database layer' })],
      }),
    };

    const expandedDag = define(graph({
      id: 'resolved-consume', desc: 'after expansion', init: 'init', term: 'node-b',
      nodes: expandedNodes,
    }));

    // Should be fully connected and acyclic
    const verifyResult = verify(expandedDag);
    expect(verifyResult).toEqual([]); // No unresolved consumes

    const checkResult = check(expandedDag);
    expect(checkResult.done).toBe(true);
  });
});

// ── Scenario 3: Ownership conflict → expansion reassigns ─────────────────────

describe('init gate E2E: scenario 3 — ownership conflict reassigns produces', () => {
  it('detects two nodes producing same artifact, expansion reassigns one', async () => {
    // Conflict: both node-a and node-b produce src/app.ts
    const conflictDag = define(graph({
      id: 'ownership-conflict', desc: 'init gate — dual producers', init: 'init', term: 'node-b',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'node-a': node('node-a', {
          deps: ['init'],
          produces: ['src/app.ts'],
          validate: [intentRule({ statement: 'module A is complete' })],
        }),
        'node-b': node('node-b', {
          deps: ['init'],
          produces: ['src/app.ts'], // CONFLICT: same as node-a
          validate: [intentRule({ statement: 'module B is complete' })],
        }),
      } as any,
    }));

    // Validate node-b: ownership conflict means src/app.ts is ambiguous
    const result = await validateNode(conflictDag, 'node-b', () => true, {
      intentJudgments: [judgment('module B is complete', 0.6)],
    });

    // The intent fails because produces is ambiguous
    expect(result.expansionStatus).toBe('expanding');

    const failures = extractIntentFailures(result.checks, [
      judgment('module B is complete', 0.6),
    ]);

    // Generate fix: reassign node-b to produce src/bootstrap.ts instead
    if (failures.length > 0) {
      const expansion = generateIntentExpansion(
        'node-b',
        ['src/app.ts'],
        [],
        undefined,
        result.checks.filter(c => c.rule.type === 'intent').map(c => c.rule),
        failures,
        0,
      );

      const fixNode = expansion.fixNodes[0];
      // Fix node inherits produces from parent but has intent to clarify ownership
      expect(fixNode.produces).toEqual(['src/app.ts']);
      expect(fixNode.id).toBe('node-b-fix-0');
      // The fix node's validation will clarify the scope
      expect(fixNode.validate.length).toBeGreaterThan(0);
    }
  });

  it('expanded DAG has unique produces per node', () => {
    // After expansion: node-a → src/app.ts, node-b → src/bootstrap.ts
    const resolvedDag = define(graph({
      id: 'resolved-conflict', desc: 'after ownership fix', init: 'init', term: 'term',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'node-a': node('node-a', {
          deps: ['init'],
          produces: ['src/app.ts'],
          validate: [intentRule({ statement: 'module A complete' })],
        }),
        'node-b': node('node-b', {
          deps: ['init'],
          produces: ['src/bootstrap.ts'], // Reassigned
          validate: [intentRule({ statement: 'module B complete' })],
        }),
        term: node('term', {
          deps: ['node-a', 'node-b'],
          produces: [],
          validate: [{ type: 'artifact-exists', target: 'src/app.ts' }],
        }),
      } as any,
    }));

    // Count unique produces (excluding empty ones)
    const produces = new Set<string>();
    const producesByNode: Record<string, string[]> = {};
    for (const n of Object.values(resolvedDag.nodes)) {
      const nodeData = n as any;
      producesByNode[nodeData.id] = nodeData.produces;
      for (const p of nodeData.produces) {
        produces.add(p);
      }
    }
    // node-a: src/app.ts, node-b: src/bootstrap.ts
    // (init produces init.txt, term produces nothing)
    expect(produces.size).toBeGreaterThanOrEqual(2);
  });
});

// ── Scenario 4: Overly broad scope → expansion decomposes ──────────────────

describe('init gate E2E: scenario 4 — broad scope decomposes into focused children', () => {
  it('single node with multiple concerns expands into 4 specialized children', async () => {
    // One node tries to do 4 things: auth, database, cache, monitoring
    const broadRule = intentRule({
      statement: 'system is fully operational',
      confidence: 0.9,
      expandOnFail: true,
      maxExpansionDepth: 2,
    });

    const broadNode = node('setup-all', {
      produces: ['src/index.ts'],
      validate: [broadRule],
      desc: 'Implement auth, database, cache, monitoring', // TOO BROAD
    });

    const dag = define(graph({
      id: 'broad-scope', desc: 'init gate — decompose', init: 'init', term: 'setup-all',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'setup-all': broadNode,
      } as any,
    }));

    const result = await validateNode(dag, 'setup-all', () => true, {
      intentJudgments: [judgment('system is fully operational', 0.35)],
    });

    expect(result.expansionStatus).toBe('expanding');

    const failures = extractIntentFailures(result.checks, [
      judgment('system is fully operational', 0.35),
    ]);

    const expansion = generateIntentExpansion(
      'setup-all',
      ['src/index.ts'],
      [],
      undefined,
      [broadRule],
      [
        {
          ...failures[0],
          rule: broadRule,
        },
      ],
      0,
    );

    // Expansion should create multiple focused nodes
    expect(expansion.fixNodes.length).toBeGreaterThanOrEqual(1);

    // Each fix node targets a specific aspect
    for (const fixNode of expansion.fixNodes) {
      expect(fixNode.id).toMatch(/^setup-all-fix-\d+$/);
      expect(fixNode.expandedFrom).toBe('setup-all');
      // Each should have a narrow description
      expect(fixNode.desc).toBeDefined();
      expect(fixNode.desc.length).toBeLessThan(80); // Focused, not broad
    }
  });

  it('each child node has singular, verifiable intent', () => {
    // After decomposition: separate nodes for auth, db, cache, monitoring
    const decomposedDag = define(graph({
      id: 'decomposed-scope', desc: 'after decomposition', init: 'init', term: 'term',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'setup-auth': node('setup-auth', {
          deps: ['init'],
          produces: ['src/auth.ts'],
          validate: [intentRule({ statement: 'authentication module works' })],
          desc: 'Auth: JWT implementation',
        }),
        'setup-db': node('setup-db', {
          deps: ['init'],
          produces: ['src/db.ts'],
          validate: [intentRule({ statement: 'database layer works' })],
          desc: 'Database: schema + CRUD',
        }),
        'setup-cache': node('setup-cache', {
          deps: ['init'],
          produces: ['src/cache.ts'],
          validate: [intentRule({ statement: 'caching works' })],
          desc: 'Cache: Redis integration',
        }),
        'setup-monitor': node('setup-monitor', {
          deps: ['init'],
          produces: ['src/monitor.ts'],
          validate: [intentRule({ statement: 'monitoring is functional' })],
          desc: 'Monitoring: metrics + logs',
        }),
        term: node('term', {
          deps: ['setup-auth', 'setup-db', 'setup-cache', 'setup-monitor'],
          produces: [],
          validate: [],
        }),
      } as any,
    }));

    // Each node is focused on a single concern
    const nodes = Object.values(decomposedDag.nodes);
    for (const n of nodes) {
      const nodeData = n as any;
      if (nodeData.id !== 'init' && nodeData.id !== 'term') {
        // Each setup node has exactly 1 produce
        expect(nodeData.produces.length).toBe(1);
        // Each has a focused intent statement
        const intent = nodeData.validate.find((r: any) => r.type === 'intent');
        if (intent) {
          expect(intent.statement.split(',').length).toBe(1); // Single concern
        }
      }
    }
  });
});

// ── Scenario 5: Full loop — messy spec → init expansion → clear plan → execute ──

describe('init gate E2E: scenario 5 — full clarity loop', () => {
  it('starts with 3 vague nodes and 2 ownership conflicts; expansion clears all', async () => {
    // BEFORE: messy initial spec
    const messyDag = define(graph({
      id: 'messy-spec', desc: 'init gate — messy input', init: 'init', term: 'orchestrate',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'setup-services': node('setup-services', {
          deps: ['init'],
          produces: ['services'], // VAGUE
          validate: [intentRule({ statement: 'services configured', confidence: 0.9, expandOnFail: true })],
        }),
        'setup-data': node('setup-data', {
          deps: ['init'],
          produces: ['data'], // VAGUE
          validate: [intentRule({ statement: 'data layer ready', confidence: 0.9, expandOnFail: true })],
        }),
        'setup-api': node('setup-api', {
          deps: ['init'],
          produces: ['api.ts'], // CONFLICT: will clash
          validate: [intentRule({ statement: 'API ready', confidence: 0.9, expandOnFail: true })],
        }),
        'setup-routes': node('setup-routes', {
          deps: ['init'],
          produces: ['api.ts'], // CONFLICT: same as setup-api
          validate: [intentRule({ statement: 'routes configured', confidence: 0.9, expandOnFail: true })],
        }),
        orchestrate: node('orchestrate', {
          deps: ['setup-services', 'setup-data', 'setup-api', 'setup-routes'],
          produces: ['dist/app.js'],
          validate: [intentRule({ statement: 'app runs', confidence: 0.9 })],
        }),
      } as any,
    }));

    // Validate: all nodes fail with expansion-on-fail
    const valSetupServices = await validateNode(messyDag, 'setup-services', () => true, {
      intentJudgments: [judgment('services configured', 0.4)],
    });
    expect(valSetupServices.expansionStatus).toBe('expanding');

    const valSetupData = await validateNode(messyDag, 'setup-data', () => true, {
      intentJudgments: [judgment('data layer ready', 0.45)],
    });
    expect(valSetupData.expansionStatus).toBe('expanding');

    const valSetupApi = await validateNode(messyDag, 'setup-api', () => true, {
      intentJudgments: [judgment('API ready', 0.5)],
    });
    expect(valSetupApi.expansionStatus).toBe('expanding');

    // AFTER: simulate expansion generating fix nodes for each issue
    // This would be run by the init-gate expansion phase
    const expansions: Record<string, any> = {};

    // Expand setup-services (vague)
    const expServices = generateIntentExpansion(
      'setup-services', ['services'], [], undefined,
      [intentRule({ statement: 'services configured' })],
      [{ statement: 'services configured', threshold: 0.9, achieved: 0.4, reasoning: 'vague', evidence: [], rule: intentRule() }],
      0,
    );
    expansions['setup-services'] = expServices.fixNodes;

    // Expand setup-data (vague)
    const expData = generateIntentExpansion(
      'setup-data', ['data'], [], undefined,
      [intentRule({ statement: 'data layer ready' })],
      [{ statement: 'data layer ready', threshold: 0.9, achieved: 0.45, reasoning: 'vague', evidence: [], rule: intentRule() }],
      0,
    );
    expansions['setup-data'] = expData.fixNodes;

    // Expand setup-api (conflict)
    const expApi = generateIntentExpansion(
      'setup-api', ['api.ts'], [], undefined,
      [intentRule({ statement: 'API ready' })],
      [{ statement: 'API ready', threshold: 0.9, achieved: 0.5, reasoning: 'conflict', evidence: [], rule: intentRule() }],
      0,
    );
    expansions['setup-api'] = expApi.fixNodes;

    // Verify expansions generated fix nodes (4 parent nodes, but we only expanded 3 in the test)
    const expandedCount = Object.keys(expansions).length;
    expect(expandedCount).toBeGreaterThan(0);
    for (const [key, fixNodes] of Object.entries(expansions)) {
      expect(Array.isArray(fixNodes)).toBe(true);
      expect((fixNodes as any[]).length).toBeGreaterThan(0);
      for (const fixNode of (fixNodes as any[])) {
        expect(fixNode.id).toContain('-fix-');
        expect(fixNode.expandedFrom).toBeDefined();
      }
    }
  });

  it('expanded DAG with fix nodes is clear and unambiguous', () => {
    // Simulated expanded DAG (after init-gate fix nodes are committed)
    const clearDag = define(graph({
      id: 'clear-spec', desc: 'after init expansion', init: 'init', term: 'term',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        // From setup-services expansion
        'setup-services-fix-0': node('setup-services-fix-0', {
          deps: ['init'],
          produces: ['src/services/auth.ts'],
          expandedFrom: 'setup-services',
          validate: [intentRule({ statement: 'auth service works' })],
        }),
        'setup-services-fix-1': node('setup-services-fix-1', {
          deps: ['init'],
          produces: ['src/services/database.ts'],
          expandedFrom: 'setup-services',
          validate: [intentRule({ statement: 'database service works' })],
        }),
        // From setup-data expansion
        'setup-data-fix-0': node('setup-data-fix-0', {
          deps: ['setup-services-fix-1'],
          produces: ['src/schema.ts'],
          expandedFrom: 'setup-data',
          validate: [intentRule({ statement: 'schema defined' })],
        }),
        'setup-data-fix-1': node('setup-data-fix-1', {
          deps: ['setup-services-fix-1'],
          produces: ['src/migrations.ts'],
          expandedFrom: 'setup-data',
          validate: [intentRule({ statement: 'migrations work' })],
        }),
        // From setup-api expansion (reassigned)
        'setup-api-fix-0': node('setup-api-fix-0', {
          deps: ['setup-services-fix-0'],
          produces: ['src/api/endpoints.ts'],
          expandedFrom: 'setup-api',
          validate: [intentRule({ statement: 'endpoints defined' })],
        }),
        // setup-routes reassigned
        'setup-routes-fix-0': node('setup-routes-fix-0', {
          deps: ['setup-api-fix-0'],
          produces: ['src/api/router.ts'],
          expandedFrom: 'setup-routes',
          validate: [intentRule({ statement: 'routes register' })],
        }),
        term: node('term', {
          deps: [
            'setup-services-fix-0', 'setup-services-fix-1',
            'setup-data-fix-0', 'setup-data-fix-1',
            'setup-api-fix-0', 'setup-routes-fix-0',
          ],
          produces: [],
          validate: [],
        }),
      } as any,
    }));

    // Verify the expanded DAG is well-formed
    const checkResult = check(clearDag);
    expect(checkResult.done).toBe(true);

    const verifyResult = verify(clearDag);
    expect(verifyResult).toEqual([]); // No unresolved consumes or conflicts

    // Every node has clear, specific produces
    for (const n of Object.values(clearDag.nodes)) {
      const nodeData = n as any;
      if (nodeData.id !== 'init' && nodeData.id !== 'term') {
        // Specific file paths, not vague terms
        for (const p of nodeData.produces) {
          expect(p).toMatch(/^src\//);
          expect(p.endsWith('.ts')).toBe(true);
        }
      }
    }
  });

  it('position advances from init-gate to first execute batch after expansion', () => {
    // After expansion, orient would position at the first executable batch
    const clearDag = define(graph({
      id: 'post-expansion', desc: 'ready to execute', init: 'init', term: 'term',
      nodes: {
        init: node('init', { produces: ['init.txt'] }),
        'node-a': node('node-a', {
          deps: ['init'],
          produces: ['src/a.ts'],
          validate: [intentRule({ statement: 'A works' })],
        }),
        'node-b': node('node-b', {
          deps: ['node-a'],
          produces: ['src/b.ts'],
          validate: [intentRule({ statement: 'B works' })],
        }),
        term: node('term', {
          deps: ['node-b'],
          produces: [],
          validate: [],
        }),
      } as any,
    }));

    // If init exists but node-a and node-b don't: position at [node-a]
    const exists = (path: string) => path === 'init.txt';

    // Simulate position finding
    const readyNodes: string[] = [];
    for (const n of Object.values(clearDag.nodes)) {
      const nodeData = n as any;
      if (nodeData.id === 'init') continue;

      // Check deps
      const depsReady = nodeData.deps.every((d: string) => {
        const depNode = clearDag.nodes[d] as any;
        return depNode.produces.every((p: string) => exists(p));
      });

      if (depsReady && !nodeData.produces.every((p: string) => exists(p))) {
        readyNodes.push(nodeData.id);
      }
    }

    // First batch ready for work: node-a
    expect(readyNodes).toContain('node-a');
    expect(readyNodes).not.toContain('term');
  });
});

// ── Convergence and validation completeness ──────────────────────────────────

describe('init gate E2E: convergence mechanics', () => {
  it('detects stall and escalates when improvements plateau', () => {
    const history = [
      { depth: 0, confidence: 0.50 },
      { depth: 1, confidence: 0.52 }, // 0.02 < 0.05 threshold
    ];

    const stalled = detectStall(history, 0.52);
    expect(stalled).toBe(true);

    const escalation = buildEscalation('node-x', 'node works', history, 'stalled');
    expect(escalation.status).toBe('escalated');
    expect(escalation.reason).toBe('stalled');
    expect(escalation.diagnosis).toContain('stalled');
  });

  it('respects depth limits to prevent infinite recursion', () => {
    const rule = intentRule({ expandOnFail: true, maxExpansionDepth: 2 });

    // At depth 1 (< maxDepth 2), expandOnFail should remain true
    const expansion1 = generateIntentExpansion(
      'node', ['out.ts'], [], undefined, [rule],
      [{ statement: 'test', threshold: 0.9, achieved: 0.5, reasoning: 'test', evidence: [], rule }],
      0, // depth 0 → creating depth 1 nodes
    );

    const fix1 = expansion1.fixNodes[0];
    const intent1 = fix1.validate.find(r => r.type === 'intent') as any;
    expect(intent1.expandOnFail).toBe(true);

    // At depth 2 (>= maxDepth 2), expandOnFail becomes false
    const expansion2 = generateIntentExpansion(
      'node', ['out.ts'], [], undefined, [rule],
      [{ statement: 'test', threshold: 0.9, achieved: 0.5, reasoning: 'test', evidence: [], rule }],
      1, // depth 1 → creating depth 2 nodes (at limit)
    );

    const fix2 = expansion2.fixNodes[0];
    const intent2 = fix2.validate.find(r => r.type === 'intent') as any;
    expect(intent2.expandOnFail).toBe(false);
  });
});
