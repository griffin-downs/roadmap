// @module auto-integrate
// @exports planIntegration, executeIntegration
// @types IntegrationPlan
// @entry roadmap

/**
 * Re-export from lib/ for top-level access.
 * Unified integration command: auto-detect metadata, generate, validate, boot.
 */

export {
  type IntegrationPlan,
  planIntegration,
  executeIntegration,
} from './lib/auto-integrate.ts';
