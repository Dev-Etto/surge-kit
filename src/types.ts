/**
 * Possible states of the Relay.
 */
export const RelayState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type RelayState = (typeof RelayState)[keyof typeof RelayState];

export type InternalOptions = Required<Omit<RelayOptions, 'onFallback'>> & {
  onFallback: ((error: Error) => Promise<any>) | null;
};

/**
 * Events emitted by the Relay instance.
 */
export const RelayEvents = {
  OPEN: 'open',
  CLOSE: 'close',
  HALF_OPEN: 'halfOpen',
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const;

export interface RelayOptions {
  /**
   * The number of consecutive failures before opening the relay.
   * @default 5
   */
  failureThreshold?: number;

  /**
   * The time in milliseconds the relay stays OPEN before transitioning to HALF_OPEN.
   * @default 30000 (30s)
   */
  coolDownPeriod?: number;

  /**
   * The maximum time in milliseconds the function can run before being considered a failure.
   * @default 10000 (10s)
   */
  executionTimeout?: number;

/**
   * A fallback function to execute when the circuit is OPEN
   * or when a call fails.
   * It receives the error that caused the failure.
   * @default null
   */
  onFallback?: (error: Error) => Promise<any>;
}

/**
 * A snapshot of the relay's metrics.
 */
export interface RelayMetrics {
  /** The current state of the relay. */
  state: RelayState;
  /** Total number of successful calls. */
  successes: number;
  /** Total number of failed calls (including timeouts). */
  failures: number;
  /** Total number of calls that timed out. */
  timeouts: number;
  /** The sum of successful and failed calls. */
  total: number;
}