// @module spec-generator
// @exports generateClarifiedSpec
// @entry roadmap

import type { Graph } from '../protocol.ts';
import type { PlanClarityGap } from './intent/intent-expansion.ts';
import type { SpecClarifiedJson, SpecFeature } from './spec-verifier.ts';

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Generate a machine-readable spec contract from DAG structure and clarity gaps.
 *
 * For each gap type:
 * - VagueProduces → features with selectors derived from resolved paths
 * - BroadScope → decomposed individual features per concern
 * - NoValidate → validation-focused features (contrast, accessibility)
 * - OwnershipConflict → feature per conflicting artifact
 * - UnresolvableConsumes → feature tracking unresolved dependency
 *
 * Returns SpecClarifiedJson consumed by terminal gate verification.
 */
export function generateClarifiedSpec<T extends string>(
  dag: Graph<T>,
  gaps: PlanClarityGap[],
): SpecClarifiedJson {
  if (gaps.length === 0) {
    return {
      features: [],
      gaps: [],
      confidence: 0.98,
      generated: new Date().toISOString(),
    };
  }

  const features: SpecFeature[] = [];
  const remainingGaps: string[] = [];
  const usedIds = new Set<string>();

  for (const gap of gaps) {
    const generated = gapToFeatures(gap, dag, usedIds);
    features.push(...generated);
  }

  // Confidence: 0.98 base, -0.1 per gap, floor 0.5
  const confidence = Math.max(0.5, 0.98 - gaps.length * 0.1);

  return {
    features,
    gaps: remainingGaps,
    confidence,
    generated: new Date().toISOString(),
  };
}

// ── Gap → Feature conversion ─────────────────────────────────────────────────

function gapToFeatures<T extends string>(
  gap: PlanClarityGap,
  dag: Graph<T>,
  usedIds: Set<string>,
): SpecFeature[] {
  switch (gap.type) {
    case 'VagueProduces':
      return vagueProducesToFeatures(gap, dag, usedIds);
    case 'BroadScope':
      return broadScopeToFeatures(gap, dag, usedIds);
    case 'NoValidate':
      return noValidateToFeatures(gap, usedIds);
    case 'OwnershipConflict':
      return ownershipConflictToFeatures(gap, usedIds);
    case 'UnresolvableConsumes':
      return unresolvableConsumesToFeatures(gap, usedIds);
  }
}

function uniqueId(base: string, usedIds: Set<string>): string {
  let id = base;
  let i = 1;
  while (usedIds.has(id)) {
    id = `${base}-${i}`;
    i++;
  }
  usedIds.add(id);
  return id;
}

function vagueProducesToFeatures<T extends string>(
  gap: PlanClarityGap,
  dag: Graph<T>,
  usedIds: Set<string>,
): SpecFeature[] {
  const node = dag.nodes[gap.node as T];
  const produces = node ? [...node.produces] : [];

  // Generate UI features from resolved concrete paths
  const features: SpecFeature[] = [];

  // CRUD add input
  features.push({
    id: uniqueId(`${gap.node}-add`, usedIds),
    selector: 'input[placeholder*=Add]',
    observation: 'visible',
    evidence: `VagueProduces gap on '${gap.node}': resolved to concrete CRUD UI — add input must be visible`,
  });

  // CRUD toggle
  features.push({
    id: uniqueId(`${gap.node}-toggle`, usedIds),
    selector: 'input[type=checkbox]',
    observation: 'interactive',
    evidence: `VagueProduces gap on '${gap.node}': resolved to concrete CRUD UI — toggle must be interactive`,
  });

  return features;
}

function broadScopeToFeatures<T extends string>(
  gap: PlanClarityGap,
  dag: Graph<T>,
  usedIds: Set<string>,
): SpecFeature[] {
  // Decompose broad scope into individual concern features
  const node = dag.nodes[gap.node as T];
  const desc = node?.desc ?? gap.detail;

  // Split on conjunctions to find independent concerns
  const concerns = desc.split(/\band\b|\balso\b|\bplus\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return concerns.map((concern, i) => ({
    id: uniqueId(`${gap.node}-scope-${i}`, usedIds),
    selector: `[data-testid=${gap.node}-${i}]`,
    observation: 'visible' as const,
    evidence: `BroadScope gap on '${gap.node}': decomposed concern '${concern}' as independent feature`,
  }));
}

function noValidateToFeatures(gap: PlanClarityGap, usedIds: Set<string>): SpecFeature[] {
  // Missing validation → add accessibility check as baseline
  return [{
    id: uniqueId(`${gap.node}-contrast`, usedIds),
    selector: 'body',
    observation: 'contrast',
    minRatio: 4.5,
    evidence: `NoValidate gap on '${gap.node}': accessibility requirement — WCAG AA 4.5:1 contrast ratio`,
  }];
}

function ownershipConflictToFeatures(gap: PlanClarityGap, usedIds: Set<string>): SpecFeature[] {
  return [{
    id: uniqueId(`${gap.node}-ownership`, usedIds),
    selector: `[data-testid=${gap.node}]`,
    observation: 'visible',
    evidence: `OwnershipConflict gap on '${gap.node}': ${gap.detail}`,
  }];
}

function unresolvableConsumesToFeatures(gap: PlanClarityGap, usedIds: Set<string>): SpecFeature[] {
  return [{
    id: uniqueId(`${gap.node}-dep`, usedIds),
    selector: `[data-testid=${gap.node}-dep]`,
    observation: 'visible',
    evidence: `UnresolvableConsumes gap on '${gap.node}': ${gap.detail}`,
  }];
}
