import { clampTimerDelay } from '../timers';
import { decorateMethod, LayerRank } from './pipeline';
import { assertInteger, assertNumber } from './validate';

export interface RetryOptions {
  /**
   * Maximum number of attempts, including the first call.
   */
  attempts: number;
  /**
   * Time in milliseconds to wait before the first retry.
   * @default 0
   */
  delay?: number;
  /**
   * Multiplier applied to the delay after each retry (exponential backoff).
   * `1` keeps a fixed delay.
   * @default 1
   */
  backoff?: number;
  /**
   * Upper bound for the delay between attempts, in milliseconds.
   * @default Infinity
   */
  maxDelay?: number;
  /**
   * Decides whether a failed attempt should be retried. Return `false` for
   * errors that will not go away by retrying (e.g. validation errors).
   * @default () => true
   */
  retryIf?: (error: Error, attempt: number) => boolean;
}

/**
 * Method decorator that retries a failed call before the error propagates.
 *
 * Retries run inside `@UseRelay`, whatever the decorator order: the relay only
 * counts a failure once every attempt has failed, and nothing is retried while
 * the relay is OPEN. The relay's `executionTimeout` applies to the whole
 * sequence of attempts, including the delays; once it expires no further
 * attempt is started (the attempt already running cannot be cancelled).
 *
 * The decorated method always returns a Promise.
 *
 * @example
 * class ApiService {
 *   // Up to 3 attempts, waiting 100ms and then 200ms between them.
 *   @Retry({ attempts: 3, delay: 100, backoff: 2 })
 *   @UseRelay()
 *   async fetchData() { ... }
 * }
 */
export function Retry(options: RetryOptions): any {
  const {
    attempts,
    delay = 0,
    backoff = 1,
    maxDelay = Infinity,
    retryIf = () => true,
  } = options;

  assertInteger('Retry', 'attempts', attempts, 1);
  assertNumber('Retry', 'delay', delay, 0);
  assertNumber('Retry', 'backoff', backoff, 1);
  assertNumber('Retry', 'maxDelay', maxDelay, 0);

  return function (
    _target: any,
    propertyKey: unknown,
    descriptor?: PropertyDescriptor
  ): any {
    return decorateMethod('Retry', propertyKey, descriptor, LayerRank.RETRY, (next) =>
      async (invocation) => {
        for (let attempt = 1; ; attempt++) {
          try {
            return await next(invocation);
          } catch (error) {
            // Stop once the caller stopped waiting (e.g. the relay timed out),
            // so abandoned calls don't keep hitting the dependency.
            if (
              attempt >= attempts ||
              invocation.abandoned ||
              !retryIf(error as Error, attempt)
            ) {
              throw error;
            }

            const wait = Math.min(delay * backoff ** (attempt - 1), maxDelay);
            if (wait > 0) {
              await new Promise((resolve) => setTimeout(resolve, clampTimerDelay(wait)));
            }
            if (invocation.abandoned) {
              throw error;
            }
          }
        }
      }
    );
  };
}
