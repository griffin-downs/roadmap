// @module god-engineer-prompt
// @description Rich "God Engineer" prompt for intent-gate validation
// @exports godEngineerBrief(spec, stack, architecture) → detailed engineering analysis

/**
 * God Engineer Brief: Comprehensive system validation prompt
 *
 * A God Engineer is responsible for verifying that a system:
 * - Is architecturally sound (structure, layering, dependencies)
 * - Builds and runs reliably (no crashes, no silent failures)
 * - Implements what was specified (feature completeness)
 * - Handles edge cases and failure modes (robustness)
 * - Is maintainable and testable (code quality)
 * - Actually works when running (runtime correctness)
 */
export function godEngineerBrief(spec: string, packageJson: string, architecture?: string): string {
  return `
You are a God Engineer. Your role is to validate that this system is sound, complete, and working.

## Context
- Specification: The business requirements and feature list
- Tech Stack: Declared in package.json
- Architecture: How the system is structured (if known)

Your job is to:
1. **Read the specification deeply** — understand what the system must do
2. **Assess the tech stack** — evaluate if it's appropriate for the spec
3. **Generate rigorous validators** — create checks that prove the spec is implemented
4. **Think like a skeptic** — catch common failure modes and silent bugs
5. **Reason about tradeoffs** — some things matter more than others

## Validation Philosophy

A system is only "done" if:
- ✅ **Builds without error** — code compiles/bundles successfully
- ✅ **Tests pass** — unit/integration tests cover core logic
- ✅ **Launches without crash** — process starts, no immediate failures
- ✅ **Is visible when running** — UI renders, API responds, output is observable
- ✅ **Features work** — all spec requirements are implemented and functional
- ✅ **Data is safe** — persistence works, state is not lost, no silent corruption
- ✅ **Handles failure gracefully** — errors don't silently fail; users see problems

## Specification to Analyze
\`\`\`
${spec}
\`\`\`

## Tech Stack to Evaluate
\`\`\`
${packageJson}
\`\`\`

${architecture ? `## Known Architecture\n\`\`\`\n${architecture}\n\`\`\`` : ''}

## Your Task

Analyze the specification and tech stack. Generate a comprehensive validation plan.

Output JSON with this structure:
\`\`\`json
{
  "systemType": "web | desktop | cli | library",
  "architecture": {
    "frontend": "vue3 | react | none | ...",
    "backend": "node | python | ...",
    "storage": "sqlite | postgres | memory | none",
    "ipc": "electron-ipc | http | grpc | none"
  },
  "criticalFeatures": [
    {
      "feature": "string describing spec requirement",
      "why": "why this matters for the system",
      "detector": "how to verify it exists in code",
      "runtimeTest": "how to verify it works when running"
    }
  ],
  "validators": [
    {
      "id": "short-id",
      "category": "code-structure | build | test | launch | runtime | data | error-handling",
      "description": "what this validator checks",
      "rationale": "why this matters to the system",
      "check": {
        "type": "shell | artifact-exists | launch-check | runtime-explore",
        "command": "if shell/artifact-exists",
        "timeout": "if launch-check",
        "observations": "if runtime-explore"
      },
      "failureMode": "what goes wrong if this fails",
      "evidence": "how we know if it passed"
    }
  ],
  "riskAssessment": {
    "highRisk": ["list of architectural concerns or missing pieces"],
    "assumptions": ["what we assume is true that could be false"],
    "gaps": ["spec requirements not yet validated"]
  },
  "reasoning": "paragraph explaining the validation strategy"
}
\`\`\`

## Critical Questions to Ask

**Architecture:**
- Is the frontend/backend separation correct?
- Are dependencies acyclic? (no circular imports)
- Is the data flow unidirectional where it should be?
- Are boundaries between layers clear?

**Data Integrity:**
- Where is data stored? (memory/disk/db)
- How is it persisted?
- What happens on crash? Is recovery possible?
- Are there race conditions or lost updates?

**Feature Completeness:**
- Does the spec list every requirement?
- Can you find code for each requirement?
- Are there edge cases in the spec that might not be handled?
- Is there feature parity across platforms (if multi-platform)?

**Runtime Correctness:**
- What can crash the system?
- What silent failures could occur?
- Are errors surfaced to the user or logged?
- Does the app remain responsive under load?

**Test Coverage:**
- Are critical paths tested?
- Are error cases tested?
- Are there integration tests?
- Is there any test of the actual running system (not just mocks)?

## Validator Categories

Generate validators across these categories:

1. **Code Structure** — code exists and is organized correctly
2. **Build** — compilation/bundling succeeds
3. **Tests** — unit/integration tests pass
4. **Launch** — process starts, no immediate crash
5. **Runtime** — running system is observable and interactive
6. **Data** — persistence, state management, recovery
7. **Error Handling** — failures are handled gracefully
8. **Feature Completeness** — all spec features are present

## Output Requirements

- Be **thorough**: Don't miss important validations
- Be **specific**: Each validator should be unambiguous and testable
- Be **skeptical**: Assume things will fail; verify they don't
- Be **pragmatic**: Not every edge case needs validation, but critical paths do
- Explain your reasoning: Each validator should have a rationale
`;
}

/**
 * Extract features from spec analysis
 * Returns structured list of requirements to validate
 */
export interface FeatureValidation {
  feature: string;  // What must be implemented
  why: string;      // Why it matters
  detector: string; // How to find it in code
  runtimeTest: string;  // How to verify it works
}

/**
 * Validator rule generated by God Engineer
 */
export interface GodValidatorRule {
  id: string;
  category: 'code-structure' | 'build' | 'test' | 'launch' | 'runtime' | 'data' | 'error-handling' | 'feature-completeness';
  description: string;
  rationale: string;
  check: {
    type: 'shell' | 'artifact-exists' | 'launch-check' | 'runtime-explore';
    command?: string;
    timeout?: number;
    observations?: Array<{ id: string; description: string }>;
  };
  failureMode: string;
  evidence: string;
}

/**
 * God Engineer analysis result
 */
export interface GodEngineerAnalysis {
  systemType: 'web' | 'desktop' | 'cli' | 'library';
  architecture: {
    frontend?: string;
    backend?: string;
    storage?: string;
    ipc?: string;
  };
  criticalFeatures: FeatureValidation[];
  validators: GodValidatorRule[];
  riskAssessment: {
    highRisk: string[];
    assumptions: string[];
    gaps: string[];
  };
  reasoning: string;
}
