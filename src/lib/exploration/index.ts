// @module exploration
// @exports (barrel re-export for exploration/observe/interact modules)
// @entry roadmap/explore

// Observation — visibility
export { checkVisible, checkInViewport, checkDisabled, checkChecked } from './visibility.ts';

// Observation — text
export { checkText, checkContainsText, checkInputValue, checkUrl, checkTitle } from './text.ts';

// Observation — style
export { checkStyle, checkComputedStyle, checkContrast, checkAttribute, checkClass } from './style.ts';

// Observation — size
export { checkSize, checkCount, checkOverflow } from './size.ts';

// Interaction — click
export { safeClick } from './click.ts';

// Interaction — type/form
export { typeAndSubmit, fillForm, selectFromDropdown, toggleCheckbox } from './type.ts';

// Interaction — drag
export { drag } from './drag.ts';

// Interaction — wait/discover
export {
  waitFor,
  waitForTransition,
  connectAndFindPage,
  resetState,
  waitForNetwork,
  waitForTextChange,
  getListItems,
  findItemBy,
  getTableData,
  capturePageState,
  getConsoleMessages,
  getNetworkCalls,
  screenshot,
} from './wait.ts';

// Runtime orchestration
export { launchApp, runExploreScript, mapObservationsToChecks, teardown } from './runtime.ts';
export type { LaunchHandle, ExploreScriptResult } from './runtime.ts';
