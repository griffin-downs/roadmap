// @module cli
// @exports EXIT_SUCCESS, EXIT_USER_ERROR, EXIT_SYSTEM_ERROR, EXIT_VALIDATION_ERROR, EXIT_TIMEOUT
// @types ExitCode

/**
 * Standard exit code semantics for CLI commands.
 * Aligns with Unix conventions and enables deterministic integration testing.
 */

export const EXIT_SUCCESS = 0;
export const EXIT_USER_ERROR = 1; // User provided invalid input, wrong flags, bad data
export const EXIT_SYSTEM_ERROR = 2; // System failure (file I/O, network, git, process)
export const EXIT_VALIDATION_ERROR = 3; // Validation failure (schema, type, constraint)
export const EXIT_TIMEOUT = 4; // Command exceeded time limit

export type ExitCode =
  | typeof EXIT_SUCCESS
  | typeof EXIT_USER_ERROR
  | typeof EXIT_SYSTEM_ERROR
  | typeof EXIT_VALIDATION_ERROR
  | typeof EXIT_TIMEOUT;

/**
 * Exit code descriptions for documentation and error messages.
 */
export const EXIT_CODE_DESCRIPTIONS: Record<ExitCode, string> = {
  [EXIT_SUCCESS]: 'Success',
  [EXIT_USER_ERROR]: 'User error (invalid input, wrong flags)',
  [EXIT_SYSTEM_ERROR]: 'System error (I/O, network, subprocess)',
  [EXIT_VALIDATION_ERROR]: 'Validation error (schema, constraint)',
  [EXIT_TIMEOUT]: 'Timeout (command exceeded limit)',
};

/**
 * Categorize an exit code.
 */
export function categorizeExitCode(code: number): ExitCode | undefined {
  if (code === EXIT_SUCCESS) return EXIT_SUCCESS;
  if (code === EXIT_USER_ERROR) return EXIT_USER_ERROR;
  if (code === EXIT_SYSTEM_ERROR) return EXIT_SYSTEM_ERROR;
  if (code === EXIT_VALIDATION_ERROR) return EXIT_VALIDATION_ERROR;
  if (code === EXIT_TIMEOUT) return EXIT_TIMEOUT;
  return undefined;
}

/**
 * Exit the process with the given code and optional message.
 */
export function exit(code: ExitCode, message?: string): never {
  if (message) {
    if (code === EXIT_SUCCESS) {
      console.log(message);
    } else {
      console.error(message);
    }
  }
  process.exit(code);
}

/**
 * Helper: exit with user error.
 */
export function exitUserError(message: string): never {
  exit(EXIT_USER_ERROR, message);
}

/**
 * Helper: exit with system error.
 */
export function exitSystemError(message: string): never {
  exit(EXIT_SYSTEM_ERROR, message);
}

/**
 * Helper: exit with validation error.
 */
export function exitValidationError(message: string): never {
  exit(EXIT_VALIDATION_ERROR, message);
}

/**
 * Helper: exit with timeout.
 */
export function exitTimeout(message: string): never {
  exit(EXIT_TIMEOUT, message);
}
