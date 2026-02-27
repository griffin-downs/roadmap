/**
 * roadmap/explore — observation + interaction helpers for CDP-based explore scripts
 *
 * Consumer usage:
 *   import { checkVisible, checkContrast, safeClick, connectAndFindPage } from 'roadmap/explore'
 */

// Observation helpers (9)
export {
  checkVisible,
  checkText,
  checkStyle,
  checkSize,
  checkCount,
  checkAttribute,
  checkClass,
  checkContrast,
  checkOverflow,
} from './lib/explore-helpers.ts';

// Interaction helpers (7)
export {
  safeClick,
  typeAndSubmit,
  drag,
  waitFor,
  waitForTransition,
  connectAndFindPage,
  resetState,
} from './lib/explore-interactions.ts';

// Runtime orchestration (launch, run, teardown)
export {
  launchApp,
  runExploreScript,
  mapObservationsToChecks,
  teardown,
} from './lib/runtime-explore.ts';

export type { LaunchHandle, ExploreScriptResult } from './lib/runtime-explore.ts';

// Types
export type { ObservationResult, ExploreResult } from './protocol.ts';
