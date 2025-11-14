/**
 * Possible states of the Circuit Breaker.
 */
export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

/**
 * Events emitted by the Circuit Breaker instance.
 */
export const CircuitEvents = {
  OPEN: 'open',
  CLOSE: 'close',
  HALF_OPEN: 'halfOpen',
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const;

export interface CircuitBreakerOptions {
  /**
   * The number of consecutive failures before opening the circuit.
   * @default 5
   */
  failureThreshold?: number;

  /**
   * The time in milliseconds the circuit stays OPEN before transitioning to HALF_OPEN.
   * @default 30000 (30s)
   */
  cooldownPeriod?: number;

  /**
   * The maximum time in milliseconds the function can run before being considered a failure.
   * @default 10000 (10s)
   */
  executionTimeout?: number;
}