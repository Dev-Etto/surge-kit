/**
 * Error thrown when an execution is attempted while the relay is OPEN.
 */
export class RelayOpenError extends Error {
  constructor() {
    super('Relay is open. Call was not attempted.');
    this.name = 'RelayOpenError';
  }
}
/**
 * Error thrown when an execution exceeds the configured `executionTimeout`.
 */
export class RelayTimeoutError extends Error {
  constructor(public readonly timeout: number) {
    super('Execution timed out');
    this.name = 'RelayTimeoutError';
  }
}
