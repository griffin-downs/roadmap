// @module verify/invariants/cli-compliance
// @exports CLI_COMPLIANCE, CLI_COMPLIANCE_FULL

import { runComplianceAudit } from '../../cli/audit-samples.ts';

export interface InvariantResult {
  code: string;
  passed: boolean;
  evidence: string[];
  fix: string[];
}

export function CLI_COMPLIANCE(base?: string): InvariantResult {
  const results = runComplianceAudit('fast', base);
  const failing = results.filter(r => r.state === 'NONCOMPLIANT');

  if (failing.length === 0) {
    return {
      code: 'CLI_COMPLIANCE',
      passed: true,
      evidence: [`${results.length} commands audited, all compliant or exempt`],
      fix: [],
    };
  }

  return {
    code: 'CLI_COMPLIANCE',
    passed: false,
    evidence: failing.map(f => `${f.id}: ${f.failingInvariant ?? 'NONCOMPLIANT'} — ${f.evidence[0]}`),
    fix: failing.map(f => `Fix "${f.id}": ${f.failingInvariant ?? 'ensure compliance'}`),
  };
}

export function CLI_COMPLIANCE_FULL(base?: string): InvariantResult {
  const results = runComplianceAudit('full', base);
  const failing = results.filter(r => r.state === 'NONCOMPLIANT');

  if (failing.length === 0) {
    return {
      code: 'CLI_COMPLIANCE_FULL',
      passed: true,
      evidence: [`${results.length} commands audited (full), all compliant or exempt`],
      fix: [],
    };
  }

  return {
    code: 'CLI_COMPLIANCE_FULL',
    passed: false,
    evidence: failing.map(f => `${f.id}: ${f.failingInvariant ?? 'NONCOMPLIANT'} — ${f.evidence[0]}`),
    fix: failing.map(f => `Fix "${f.id}": ${f.failingInvariant ?? 'ensure compliance'}`),
  };
}
