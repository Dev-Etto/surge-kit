import { BulkheadRejectedError } from '../errors';
import { decorateMethod, LayerRank } from './pipeline';
import { assertInteger } from './validate';

export interface BulkheadOptions {
  /**
   * Maximum number of calls of the method running at the same time.
   */
  maxConcurrent: number;
  /**
   * Maximum number of calls waiting for a free slot. Calls beyond it are
   * rejected. `0` rejects as soon as `maxConcurrent` is reached.
   * @default 0
   */
  maxQueue?: number;
}

/**
 * Method decorator that limits how many calls of the method can be pending at
 * once, isolating the rest of the application from a slow dependency.
 *
 * When the limit (and the queue, if any) is full, the call fails fast with a
 * `BulkheadRejectedError` without invoking the method. Rejections happen
 * before `@UseRelay`, so they are not counted as relay failures, and they can
 * be handled by `@Fallback`. Queued calls start in FIFO order.
 *
 * The limit is shared by all instances of the class. The decorated method
 * always returns a Promise.
 *
 * @example
 * class PaymentService {
 *   @Bulkhead({ maxConcurrent: 10 })
 *   async processPayment() { ... }
 * }
 */
export function Bulkhead(options: BulkheadOptions): any {
  const { maxConcurrent, maxQueue = 0 } = options;

  assertInteger('Bulkhead', 'maxConcurrent', maxConcurrent, 1);
  assertInteger('Bulkhead', 'maxQueue', maxQueue, 0);

  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): any {
    let active = 0;
    const queue: Array<() => void> = [];

    // Hands the slot to the next queued call, or frees it.
    const release = () => {
      const nextInQueue = queue.shift();
      if (nextInQueue) {
        nextInQueue();
      } else {
        active--;
      }
    };

    return decorateMethod(descriptor, LayerRank.BULKHEAD, (next) =>
      async function (this: any, ...args: any[]) {
        if (active < maxConcurrent) {
          active++;
        } else if (queue.length < maxQueue) {
          await new Promise<void>((resolve) => queue.push(resolve));
        } else {
          throw new BulkheadRejectedError(maxConcurrent, maxQueue);
        }

        try {
          return await next.apply(this, args);
        } finally {
          release();
        }
      }
    );
  };
}
