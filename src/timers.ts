/**
 * Largest delay `setTimeout` supports. Longer (or infinite) delays overflow
 * and Node fires the timer after 1ms instead.
 */
export const MAX_TIMER_DELAY = 2 ** 31 - 1;

/**
 * Caps a delay so it never overflows `setTimeout`.
 */
export function clampTimerDelay(ms: number): number {
  return Math.min(ms, MAX_TIMER_DELAY);
}

/**
 * Monotonic clock in milliseconds. Unlike `Date.now()`, it is not affected by
 * system clock adjustments (e.g. NTP), so measured intervals stay correct.
 */
export function monotonicNow(): number {
  return performance.now();
}
