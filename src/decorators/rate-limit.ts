import { RateLimitExceededError } from '../errors';
import { monotonicNow } from '../timers';
import { decorateMethod, LayerRank } from './pipeline';
import { assertInteger, assertNumber } from './validate';

export interface RateLimitOptions {
  /**
   * Maximum number of calls allowed within `windowMs`.
   */
  limit: number;
  /**
   * Length of the sliding window, in milliseconds.
   */
  windowMs: number;
}

/**
 * Method decorator that enforces a client-side rate limit using a sliding
 * window: at most `limit` calls start within any `windowMs` interval.
 *
 * Calls over the limit fail with a `RateLimitExceededError` (exposing
 * `retryAfterMs`) without invoking the method. Rejections happen before
 * `@UseRelay`, so they are not counted as relay failures, and they can be
 * handled by `@Fallback`. Rejected calls do not consume the limit, and
 * retries made by `@Retry` within one call count as a single call.
 *
 * The limit is shared by all instances of the class. The decorated method
 * always returns a Promise.
 *
 * @example
 * class ExternalApiService {
 *   // At most 50 calls per minute.
 *   @RateLimit({ limit: 50, windowMs: 60000 })
 *   async fetchThirdPartyData() { ... }
 * }
 */
export function RateLimit(options: RateLimitOptions): any {
  const { limit, windowMs } = options;

  assertInteger('RateLimit', 'limit', limit, 1);
  assertNumber('RateLimit', 'windowMs', windowMs, 1);

  return function (
    _target: any,
    propertyKey: unknown,
    descriptor?: PropertyDescriptor
  ): any {
    // Start times of the calls accepted within the current window, oldest first.
    const callTimes: number[] = [];

    return decorateMethod('RateLimit', propertyKey, descriptor, LayerRank.RATE_LIMIT, (next) =>
      async (invocation) => {
        const now = monotonicNow();
        while (callTimes.length > 0 && callTimes[0] <= now - windowMs) {
          callTimes.shift();
        }

        if (callTimes.length >= limit) {
          throw new RateLimitExceededError(
            limit,
            windowMs,
            Math.ceil(callTimes[0] + windowMs - now)
          );
        }

        callTimes.push(now);
        return next(invocation);
      }
    );
  };
}
