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

/**
 * Error thrown by `@Bulkhead` when the concurrency limit and the queue are full.
 */
export class BulkheadRejectedError extends Error {
  constructor(
    public readonly maxConcurrent: number,
    public readonly maxQueue: number
  ) {
    super(
      `Bulkhead is full (maxConcurrent: ${maxConcurrent}, maxQueue: ${maxQueue}). Call was not attempted.`
    );
    this.name = 'BulkheadRejectedError';
  }
}

/**
 * Error thrown by `@RateLimit` when the call limit for the window is reached.
 */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly windowMs: number,
    /** Milliseconds until a call would be accepted again. */
    public readonly retryAfterMs: number
  ) {
    super(
      `Rate limit of ${limit} calls per ${windowMs}ms exceeded. Call was not attempted.`
    );
    this.name = 'RateLimitExceededError';
  }
}
