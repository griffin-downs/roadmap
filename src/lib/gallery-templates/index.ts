// @module gallery-templates
// @exports TemplateDefinition, TEMPLATES, buildGallery
// @entry roadmap

import type { GalleryCandidate, TemplateParams } from '../gallery.ts';
import { computeRisk, paretoFilter } from '../gallery.ts';
import { estimateCost } from '../cost-estimator.ts';

export interface TemplateDefinition {
  id: 'aggressive' | 'corrective' | 'staged' | 'budget'
  label: string
  summary: string
  parameters: TemplateParams
  buildDag(specSource: string, historyFailureClasses?: string[]): Record<string, unknown>
}

// Gate profiles matching gallery.ts GATE_PROFILES constants
const GATE_PROFILE_PARALLEL: GalleryCandidate['gateProfile'] = { deterministic: 6, intent: 3, runtime: 1 };
const GATE_PROFILE_SERIAL: GalleryCandidate['gateProfile'] = { deterministic: 5, intent: 3, runtime: 2 };

// aggressive — single-pass, parallel gates, no pre-expansion, opus-all, until-clean
// corrective — single-pass, serial gates, history pre-expansion, opus-emit+haiku-fix, until-clean
// staged    — two-stage, serial gates, spec-complexity pre-expansion, opus-emit+haiku-fix, until-clean
// budget    — single-pass, parallel gates, no pre-expansion, haiku-emit+opus-judge, fixed-passes
export const TEMPLATES: Record<'aggressive' | 'corrective' | 'staged' | 'budget', TemplateDefinition> = {
  aggressive: {
    id: 'aggressive',
    label: 'aggressive',
    summary: 'Single-pass emit, all gates parallel, no pre-expansion',
    parameters: {
      emitStrategy: 'single-pass',
      gateOrdering: 'parallel',
      preExpansion: 'none',
      modelAllocation: 'opus-all',
      convergence: 'until-clean',
    },
    buildDag(specSource: string, _historyFailureClasses?: string[]): Record<string, unknown> {
      // 6-node dag: emit → compile+test (parallel) → runtime → converged
      return {
        id: `aggressive-${specSource.slice(0, 8).replace(/\W/g, '_')}`,
        nodes: {
          emit: { id: 'emit', desc: 'Single-pass emit', deps: [] },
          compile: { id: 'compile', desc: 'Compile gate', deps: ['emit'] },
          test: { id: 'test', desc: 'Test gate', deps: ['emit'] },
          intent: { id: 'intent', desc: 'Intent gate (parallel)', deps: ['emit'] },
          runtime: { id: 'runtime', desc: 'Runtime check', deps: ['compile', 'test', 'intent'] },
          converged: { id: 'converged', desc: 'Convergence term', deps: ['runtime'] },
        },
      };
    },
  },

  corrective: {
    id: 'corrective',
    label: 'corrective',
    summary: 'Serial gates, pre-expanded fix nodes for known failure classes',
    parameters: {
      emitStrategy: 'single-pass',
      gateOrdering: 'serial',
      preExpansion: 'from-history',
      modelAllocation: 'opus-emit+haiku-fix',
      convergence: 'until-clean',
    },
    buildDag(specSource: string, historyFailureClasses: string[] = []): Record<string, unknown> {
      // Base: emit → compile → test → intent → runtime → converged (6 nodes)
      // + 2 nodes per historyFailureClass: <class>-detect, <class>-fix
      const baseNodes: Record<string, unknown> = {
        emit: { id: 'emit', desc: 'Single-pass emit', deps: [] },
        compile: { id: 'compile', desc: 'Compile gate', deps: ['emit'] },
        test: { id: 'test', desc: 'Test gate', deps: ['compile'] },
        intent: { id: 'intent', desc: 'Intent gate', deps: ['test'] },
        runtime: { id: 'runtime', desc: 'Runtime check', deps: ['intent'] },
        converged: { id: 'converged', desc: 'Convergence term', deps: ['runtime'] },
      };

      for (const cls of historyFailureClasses) {
        const safe = cls.replace(/\W/g, '_');
        baseNodes[`${safe}-detect`] = { id: `${safe}-detect`, desc: `Detect ${cls}`, deps: ['emit'] };
        baseNodes[`${safe}-fix`] = { id: `${safe}-fix`, desc: `Fix ${cls}`, deps: [`${safe}-detect`] };
        // Fold fix nodes into the serial chain before runtime
        const converged = baseNodes['converged'] as { deps: string[] };
        converged.deps = [...converged.deps.filter(d => d !== 'runtime'), `${safe}-fix`, 'runtime'];
      }

      return {
        id: `corrective-${specSource.slice(0, 8).replace(/\W/g, '_')}`,
        nodes: baseNodes,
      };
    },
  },

  staged: {
    id: 'staged',
    label: 'staged',
    summary: 'Two-stage emit (skeleton then features), serial gates',
    parameters: {
      emitStrategy: 'two-stage',
      gateOrdering: 'serial',
      preExpansion: 'from-spec-complexity',
      modelAllocation: 'opus-emit+haiku-fix',
      convergence: 'until-clean',
    },
    buildDag(specSource: string, _historyFailureClasses?: string[]): Record<string, unknown> {
      // 9-node dag: emit-skeleton → compile → emit-features → test → intent → runtime → converged
      // + skeleton-validate, feature-validate for the two emit stages
      return {
        id: `staged-${specSource.slice(0, 8).replace(/\W/g, '_')}`,
        nodes: {
          'emit-skeleton': { id: 'emit-skeleton', desc: 'Emit skeleton structure', deps: [] },
          'skeleton-validate': { id: 'skeleton-validate', desc: 'Validate skeleton shape', deps: ['emit-skeleton'] },
          compile: { id: 'compile', desc: 'Compile gate', deps: ['skeleton-validate'] },
          'emit-features': { id: 'emit-features', desc: 'Emit feature implementations', deps: ['compile'] },
          'feature-validate': { id: 'feature-validate', desc: 'Validate feature completeness', deps: ['emit-features'] },
          test: { id: 'test', desc: 'Test gate', deps: ['feature-validate'] },
          intent: { id: 'intent', desc: 'Intent gate', deps: ['test'] },
          runtime: { id: 'runtime', desc: 'Runtime check', deps: ['intent'] },
          converged: { id: 'converged', desc: 'Convergence term', deps: ['runtime'] },
        },
      };
    },
  },

  budget: {
    id: 'budget',
    label: 'budget',
    summary: 'Haiku emit, parallel gates, fixed pass count — lowest cost',
    parameters: {
      emitStrategy: 'single-pass',
      gateOrdering: 'parallel',
      preExpansion: 'none',
      modelAllocation: 'haiku-emit+opus-judge',
      convergence: 'fixed-passes',
    },
    buildDag(specSource: string, _historyFailureClasses?: string[]): Record<string, unknown> {
      // 6-node dag: emit → compile+test (parallel) → runtime → converged
      return {
        id: `budget-${specSource.slice(0, 8).replace(/\W/g, '_')}`,
        nodes: {
          emit: { id: 'emit', desc: 'Single-pass emit (haiku)', deps: [] },
          compile: { id: 'compile', desc: 'Compile gate', deps: ['emit'] },
          test: { id: 'test', desc: 'Test gate', deps: ['emit'] },
          judge: { id: 'judge', desc: 'Opus judge gate (parallel)', deps: ['emit'] },
          runtime: { id: 'runtime', desc: 'Runtime check', deps: ['compile', 'test', 'judge'] },
          converged: { id: 'converged', desc: 'Convergence term (fixed passes)', deps: ['runtime'] },
        },
      };
    },
  },
};

// Node counts per template (baseNodes) and maxExpansion
const TEMPLATE_NODE_COUNTS: Record<'aggressive' | 'corrective' | 'staged' | 'budget', {
  baseNodes: number;
  maxExpansion(historyFailureClasses?: string[]): number;
}> = {
  aggressive: { baseNodes: 6, maxExpansion: () => 9 },
  corrective: {
    baseNodes: 6,
    maxExpansion: (cls = []) => Math.round((6 + cls.length * 2) * 1.5),
  },
  staged: { baseNodes: 9, maxExpansion: () => 14 },
  budget: { baseNodes: 6, maxExpansion: () => 8 },
};

export function buildGallery(specSource: string, historyDir?: string): GalleryCandidate[] {
  const ids = ['aggressive', 'corrective', 'staged', 'budget'] as const;

  // Cold-start risk when no history is available
  const coldStartRisk = computeRisk(0, 0); // → 1.0

  const candidates: GalleryCandidate[] = ids.map(id => {
    const tpl = TEMPLATES[id];
    const counts = TEMPLATE_NODE_COUNTS[id];
    const baseNodes = counts.baseNodes;
    const maxExpansion = counts.maxExpansion();

    // Use maxExpansion for cost — mirrors gallery.ts buildCandidate convention
    const costEst = estimateCost({
      nodeCount: baseNodes,
      modelAllocation: tpl.parameters.modelAllocation,
    });

    // Determine risk: cold-start unless historyDir supplied (future: parse historyDir)
    const risk = historyDir !== undefined
      ? computeRisk(0, 0) // placeholder — no reader for historyDir format yet
      : coldStartRisk;

    const gateProfile = tpl.parameters.gateOrdering === 'parallel'
      ? GATE_PROFILE_PARALLEL
      : GATE_PROFILE_SERIAL;

    const candidate: GalleryCandidate = {
      id,
      label: tpl.label,
      summary: tpl.summary,
      parameters: tpl.parameters,
      dag: tpl.buildDag(specSource),
      estimates: {
        nodes: baseNodes,
        maxExpansion,
        wallClockMinutes: costEst.wallClockMinutes,
        costUSD: costEst.costUSD,
        risk,
      },
      gateProfile,
    };

    return candidate;
  });

  return paretoFilter(candidates);
}
