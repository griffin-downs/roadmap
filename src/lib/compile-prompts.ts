// @module compile-prompts (barrel — re-exports from config/)
// @exports compilePrompts, parseEnvironment, fillTemplate, validateCompiledPrompts, checkStaleness
// @types EnvironmentSections, CompiledPrompt, CompileResult, ValidationViolation, CompilePromptsOpts
// @entry roadmap

export { parseEnvironment, checkStaleness, fillTemplate } from './config/system-prompt.ts';
export type { EnvironmentSections } from './config/system-prompt.ts';
export { compilePrompts, validateCompiledPrompts } from './config/context-prompt.ts';
export type { CompiledPrompt, CompileResult, ValidationViolation, CompilePromptsOpts } from './config/context-prompt.ts';
