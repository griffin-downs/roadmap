// @module terminal-audit/gap-expansion
// @description Convert detected audit gaps into DAG fix nodes via dag.insert
// @exports expandGaps, GapFixNode, GapExpansionResult

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../../protocol.ts';
import { insertNode, modifyNode } from '../dag-mutator.ts';
import type { DetectedGap, DetectionResult } from './detected.ts';

export interface GapFixNode {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  validate: any[];
  gapType: DetectedGap['type'];
  gapArtifact: string;
  sourceNodeId: string;
}

export interface GapExpansionResult {
  expanded: boolean;
  fixNodes: GapFixNode[];
  dag: Graph<string>;
  reason: string;
}

/**
 * Convert detected gaps into fix nodes and insert them into the DAG.
 *
 * For each gap type:
 * - uncovered-consume: insert a fix node that adds an artifact-exists
 *   validator to the consuming node
 * - untested-produce: insert a fix node that adds a shell test
 *   covering the untested artifact
 * - scope-leak: insert a fix node that either adds the file to a
 *   node's produces or removes it
 *
 * Fix nodes are inserted as deps of the terminal node, blocking
 * terminal completion until all gaps are addressed.
 */
export function expandGaps(
  dag: Graph<string>,
  detected: DetectionResult,
  repoRoot: string,
): GapExpansionResult {
  if (detected.gaps.length === 0) {
    return { expanded: false, fixNodes: [], dag, reason: 'No gaps detected' };
  }

  // Deduplicate: one fix node per unique (type, artifact) pair
  const seen = new Set<string>();
  const uniqueGaps: DetectedGap[] = [];
  for (const gap of detected.gaps) {
    const key = `${gap.type}:${gap.artifact}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueGaps.push(gap);
  }

  let mutatedDag = dag;
  const fixNodes: GapFixNode[] = [];

  for (let i = 0; i < uniqueGaps.length; i++) {
    const gap = uniqueGaps[i];
    const fixNode = gapToFixNode(gap, i, mutatedDag);
    if (!fixNode) continue;

    // Insert the fix node
    const { dag: afterInsert } = insertNode(
      mutatedDag,
      {
        id: fixNode.id,
        desc: fixNode.desc,
        produces: fixNode.produces,
        consumes: fixNode.consumes,
        deps: fixNode.deps,
        validate: fixNode.validate,
        idempotent: true,
      },
      `gap-expansion: ${gap.type} for ${gap.artifact}`,
    );

    // Wire terminal to depend on fix node
    const termNode = afterInsert.nodes[afterInsert.term as keyof typeof afterInsert.nodes] as any;
    if (termNode && !termNode.deps.includes(fixNode.id)) {
      const { dag: afterWire } = modifyNode(
        afterInsert,
        afterInsert.term,
        { deps: [...termNode.deps, fixNode.id] },
        `gap-expansion: wire terminal to depend on ${fixNode.id}`,
      );
      mutatedDag = afterWire;
    } else {
      mutatedDag = afterInsert;
    }

    fixNodes.push(fixNode);
  }

  if (fixNodes.length === 0) {
    return { expanded: false, fixNodes: [], dag, reason: 'No actionable gaps' };
  }

  // Write mutated DAG to disk
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(headPath, JSON.stringify(mutatedDag, null, 2) + '\n');

  return {
    expanded: true,
    fixNodes,
    dag: mutatedDag,
    reason: `${fixNodes.length} fix node(s) inserted for ${uniqueGaps.length} gap(s)`,
  };
}

function gapToFixNode(
  gap: DetectedGap,
  index: number,
  dag: Graph<string>,
): GapFixNode | null {
  switch (gap.type) {
    case 'uncovered-consume':
      return uncoveredConsumeFixNode(gap, index, dag);
    case 'untested-produce':
      return untestedProduceFixNode(gap, index, dag);
    case 'scope-leak':
      return scopeLeakFixNode(gap, index, dag);
    default:
      return null;
  }
}

/**
 * uncovered-consume: the consuming node needs an artifact-exists validator
 * for the consumed artifact. Fix node modifies the consuming node's validators.
 */
function uncoveredConsumeFixNode(
  gap: DetectedGap,
  index: number,
  dag: Graph<string>,
): GapFixNode {
  const id = `fix-uncovered-consume-${index}`;
  const sourceNode = gap.nodeId;
  // Find which completed node produces this artifact
  const producerDeps = findCompletedDeps(sourceNode, dag);

  return {
    id,
    desc: `Fix uncovered consume: add artifact-exists validator for "${gap.artifact}" on node "${sourceNode}". ` +
      `This file is consumed but no validator checks it exists before the node runs.`,
    produces: [],
    consumes: [],
    deps: producerDeps.length > 0 ? producerDeps : [dag.init],
    validate: [
      {
        type: 'shell',
        command: `node -e "const g=JSON.parse(require('fs').readFileSync('.roadmap/head.json','utf-8')); const n=g.nodes['${sourceNode}']; const has=n.validate.some(v=>v.type==='artifact-exists'&&(v.path==='${gap.artifact}'||v.target==='${gap.artifact}')); if(!has){console.error('Missing artifact-exists for ${gap.artifact} on ${sourceNode}');process.exit(1)}"`,
      },
    ],
    gapType: gap.type,
    gapArtifact: gap.artifact,
    sourceNodeId: sourceNode,
  };
}

/**
 * untested-produce: the producing node needs a shell test that exercises
 * the produced artifact. Fix node adds a test or validator.
 */
function untestedProduceFixNode(
  gap: DetectedGap,
  index: number,
  dag: Graph<string>,
): GapFixNode {
  const id = `fix-untested-produce-${index}`;
  const sourceNode = gap.nodeId;

  // Determine appropriate test based on file extension
  const artifact = gap.artifact;
  let testCommand: string;
  if (artifact.endsWith('.ts') || artifact.endsWith('.tsx')) {
    testCommand = `npx tsc --noEmit ${artifact}`;
  } else if (artifact.endsWith('.json')) {
    testCommand = `node -e "JSON.parse(require('fs').readFileSync('${artifact}','utf-8'))"`;
  } else {
    testCommand = `test -f ${artifact} && test -s ${artifact}`;
  }

  return {
    id,
    desc: `Fix untested produce: add shell validator for "${artifact}" on node "${sourceNode}". ` +
      `This file is produced but no shell command tests its correctness.`,
    produces: [],
    consumes: [],
    deps: [sourceNode],
    validate: [
      { type: 'shell', command: testCommand },
    ],
    gapType: gap.type,
    gapArtifact: artifact,
    sourceNodeId: sourceNode,
  };
}

/**
 * scope-leak: a changed file is outside all produces[]. Either add it
 * to the right node's produces or verify it should be excluded.
 */
function scopeLeakFixNode(
  gap: DetectedGap,
  index: number,
  dag: Graph<string>,
): GapFixNode {
  const id = `fix-scope-leak-${index}`;

  return {
    id,
    desc: `Fix scope leak: "${gap.artifact}" was changed but is not in any node's produces[]. ` +
      `Either add it to the correct node via dag.modify or revert the change.`,
    produces: [],
    consumes: [],
    deps: [dag.init],
    validate: [
      {
        type: 'shell',
        command: `node -e "const g=JSON.parse(require('fs').readFileSync('.roadmap/head.json','utf-8')); const all=Object.values(g.nodes).flatMap(n=>n.produces||[]); if(!all.includes('${gap.artifact}')){console.error('${gap.artifact} still not in any produces[]');process.exit(1)}"`,
      },
    ],
    gapType: gap.type,
    gapArtifact: gap.artifact,
    sourceNodeId: '',
  };
}

/** Find completed dependency node IDs for a given node */
function findCompletedDeps(nodeId: string, dag: Graph<string>): string[] {
  const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
  if (!node) return [];
  return (node.deps ?? []).filter((d: string) => d in dag.nodes);
}
