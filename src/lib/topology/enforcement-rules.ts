// @module topology/enforcement-rules
// @exports EnforcementRule, EnforcementResult, evaluateRule, PRODUCTION_RULES, DEVELOPMENT_RULES
// @entry roadmap/topology

export type CloneRole = 'production' | 'development' | 'unknown';
export type Operation = 'push' | 'merge' | 'fetch' | 'checkout' | 'commit' | 'work' | 'read';

export interface EnforcementResult {
  operation: Operation;
  from: string;
  to?: string;
  branch?: string;
  allowed: boolean;
  reason: string;
  guidance: string;
  enforcement: string;
}

interface RuleInput {
  operation: Operation;
  branch?: string;
  to?: string;
}

type RuleEvaluator = (input: RuleInput) => EnforcementResult | null;

function productionRule(input: RuleInput): EnforcementResult | null {
  const base = { operation: input.operation, from: 'production-clone', to: input.to, branch: input.branch };

  switch (input.operation) {
    case 'push':
      return { ...base, allowed: false, reason: 'production clone is mirror-only; push disabled to prevent accidental overwrites', guidance: 'To push changes, work in ~/src/.dev/roadmap and push from there', enforcement: 'gitsafe + pre-commit hooks block push from production' };

    case 'merge':
      return { ...base, allowed: false, reason: 'production clone is mirror-only; merge disabled', guidance: 'Merge from development clone via PR workflow', enforcement: 'pre-commit Gate 0 blocks direct commits on main' };

    case 'fetch':
      return { ...base, allowed: true, reason: 'fetch keeps production clone in sync with origin', guidance: 'Safe to fetch; production clone should always reflect origin/main', enforcement: 'no restriction on fetch' };

    case 'checkout':
      if (input.branch && input.branch.startsWith('feat/')) {
        return { ...base, allowed: false, reason: 'feature branches are for development clone only', guidance: 'Work on features in ~/src/.dev/roadmap', enforcement: 'convention: production clone stays on main' };
      }
      return { ...base, allowed: true, reason: 'checkout for inspection is allowed', guidance: 'Read-only checkout for reference is safe', enforcement: 'no restriction on read-only checkout' };

    case 'commit':
      if (!input.branch || input.branch === 'main' || input.branch === 'master') {
        return { ...base, allowed: false, reason: 'direct commits to main are blocked in production clone', guidance: 'Use development clone for commits', enforcement: 'pre-commit Gate 0 blocks direct commits on main' };
      }
      return { ...base, allowed: false, reason: 'production clone is mirror-only; all commits go through development clone', guidance: 'Work in ~/src/.dev/roadmap', enforcement: 'gitsafe branch restrictions' };

    case 'work':
      if (input.branch && input.branch.startsWith('feat/')) {
        return { ...base, allowed: false, reason: 'feature work belongs in development clone', guidance: 'Use ~/src/.dev/roadmap for feature development', enforcement: 'convention + gitsafe enforcement' };
      }
      return { ...base, allowed: false, reason: 'production clone is read-only mirror', guidance: 'All work happens in ~/src/.dev/roadmap', enforcement: 'gitsafe + pre-commit hooks' };

    case 'read':
      return { ...base, allowed: true, reason: 'production clone is the authoritative read source', guidance: 'Consumers should import from this clone', enforcement: 'no restriction on reads' };

    default:
      return null;
  }
}

function developmentRule(input: RuleInput): EnforcementResult | null {
  const base = { operation: input.operation, from: 'development-clone', to: input.to, branch: input.branch };

  switch (input.operation) {
    case 'push':
      if (input.branch && input.branch.startsWith('feat/')) {
        return { ...base, allowed: true, reason: 'feature branch push is the standard workflow', guidance: 'Push feature branch, then create PR to main', enforcement: 'no restriction on feat/* push' };
      }
      if (!input.branch || input.branch === 'main') {
        return { ...base, allowed: false, reason: 'direct push to main is blocked; use PR workflow', guidance: 'Create feature branch, push, and open PR', enforcement: 'pre-commit Gate 0 + branch protection' };
      }
      return { ...base, allowed: true, reason: 'non-main branch push is allowed from development', guidance: 'Standard git workflow', enforcement: 'no restriction' };

    case 'merge':
      if (input.branch && input.branch.startsWith('feat/')) {
        return { ...base, allowed: true, reason: 'feature branch merge via PR is the standard workflow', guidance: 'Merge feat/* -> main via PR', enforcement: 'PR review required' };
      }
      return { ...base, allowed: false, reason: 'direct merge to main without PR is not allowed', guidance: 'Use PR workflow for all merges to main', enforcement: 'branch protection' };

    case 'fetch':
      return { ...base, allowed: true, reason: 'fetch keeps development clone in sync', guidance: 'Fetch regularly to stay current', enforcement: 'no restriction on fetch' };

    case 'commit':
      if (!input.branch || input.branch === 'main' || input.branch === 'master') {
        return { ...base, allowed: false, reason: 'direct commits to main are blocked', guidance: 'Create feature branch: git checkout -b feat/<name>', enforcement: 'pre-commit Gate 0 blocks direct commits on main' };
      }
      return { ...base, allowed: true, reason: 'commits on feature branches are the standard workflow', guidance: 'Commit to feature branch, then push and PR', enforcement: 'pre-commit hooks validate (denylist, typecheck, DAG)' };

    case 'work':
      if (!input.branch || input.branch === 'main') {
        return { ...base, allowed: false, reason: 'work on main is blocked; use feature branches', guidance: 'git checkout -b feat/<name>', enforcement: 'pre-commit Gate 0' };
      }
      return { ...base, allowed: true, reason: 'feature branch work is the standard workflow', guidance: 'Work on feat/* branch, commit, push, PR', enforcement: 'pre-commit hooks active' };

    case 'checkout':
      return { ...base, allowed: true, reason: 'checkout is unrestricted in development clone', guidance: 'Standard git workflow', enforcement: 'no restriction' };

    case 'read':
      return { ...base, allowed: true, reason: 'reads are unrestricted', guidance: 'Note: consumers should import from production clone, not dev', enforcement: 'no restriction on reads' };

    default:
      return null;
  }
}

export function evaluateRule(role: CloneRole, input: RuleInput): EnforcementResult {
  const evaluator = role === 'production' ? productionRule : developmentRule;
  const result = evaluator(input);
  if (result) return result;
  return {
    operation: input.operation,
    from: `${role}-clone`,
    to: input.to,
    branch: input.branch,
    allowed: false,
    reason: `unknown operation: ${input.operation}`,
    guidance: 'Check roadmap topology help for supported operations',
    enforcement: 'unknown',
  };
}
