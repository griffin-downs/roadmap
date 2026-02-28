/**
 * roadmap/explore — observation + interaction helpers for CDP-based explore scripts
 *
 * Consumer usage:
 *   import { checkVisible, checkContrast, safeClick, connectAndFindPage } from 'roadmap/explore'
 */

// Observation helpers (17)
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
  checkDisabled,
  checkChecked,
  checkContainsText,
  checkInputValue,
  checkUrl,
  checkTitle,
  checkComputedStyle,
  checkInViewport,
} from './lib/explore-helpers.ts';

// Interaction helpers (19)
export {
  safeClick,
  typeAndSubmit,
  drag,
  waitFor,
  waitForTransition,
  connectAndFindPage,
  resetState,
  fillForm,
  selectFromDropdown,
  toggleCheckbox,
  getListItems,
  findItemBy,
  getTableData,
  waitForNetwork,
  waitForTextChange,
  capturePageState,
  getConsoleMessages,
  getNetworkCalls,
  screenshot,
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
