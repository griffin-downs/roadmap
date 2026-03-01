// Public validation API (simplified)
// Import helpers from src/lib/internal/validation-helpers for advanced use

import { validateType, validatePath, validateRef } from './internal/validation-helpers.ts';

export function validateNode(node: any): boolean {
  return validateType(node) && validatePath(node.id);
}

export function validateGraph(graph: any): boolean {
  return validateType(graph) && validateRef(graph.id);
}

// Deprecated: use validateNode/validateGraph instead
// export { validateType, validatePath, validateRef };
