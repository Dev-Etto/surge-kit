import { MAX_TIMER_DELAY, monotonicNow } from '../timers';
import { decorateMethod, LayerRank } from './pipeline';
import { assertInteger, assertNumber } from './validate';

export interface CacheOptions {
  /**
   * Time in milliseconds a result stays cached.
   */
  ttl: number;
  /**
   * Builds the cache key from the call arguments. Throw to skip the cache
   * for a call.
   * @default defaultCacheKey
   */
  key?: (...args: any[]) => string;
  /**
   * Maximum number of entries kept per instance. When exceeded, the least
   * recently used entry is evicted.
   * @default Infinity
   */
  maxSize?: number;
}

/**
 * The default `@Cache` key: a JSON encoding of the arguments that keeps
 * values JSON would conflate apart (`undefined`/`null`, `NaN`, `Infinity`,
 * `-0`, bigint). It throws, so the call goes through uncached, for arguments
 * it cannot encode without losing information: functions, symbols, `Map`,
 * `Set`, other non-plain objects without own enumerable properties (and no
 * `toJSON`), and circular structures. Pass a custom `key` for those.
 */
export function defaultCacheKey(...args: any[]): string {
  return JSON.stringify(args, function (this: any, property: string, value: any) {
    // `value` has already gone through `toJSON` (e.g. Dates); the raw value
    // is still on the holder.
    const raw = this[property];

    switch (typeof raw) {
      case 'undefined':
        return { [TAG]: 'undefined' };
      case 'bigint':
        return { [TAG]: 'bigint', value: raw.toString() };
      case 'number':
        if (!Number.isFinite(raw) || Object.is(raw, -0)) {
          return { [TAG]: 'number', value: Object.is(raw, -0) ? '-0' : String(raw) };
        }
        return value;
      case 'function':
      case 'symbol':
        throw new TypeError(`Cannot build a cache key from a ${typeof raw} argument.`);
    }

    if (
      raw !== null &&
      typeof raw === 'object' &&
      typeof raw.toJSON !== 'function' &&
      !Array.isArray(raw)
    ) {
      const prototype = Object.getPrototypeOf(raw);
      const isPlain = prototype === Object.prototype || prototype === null;
      if (
        raw instanceof Map ||
        raw instanceof Set ||
        (!isPlain && Object.keys(raw).length === 0)
      ) {
        throw new TypeError('Cannot build a cache key from this argument without losing information.');
      }
    }

    return value;
  });
}

const TAG = '__surgeKitCacheKey';

interface CacheEntry {
  value: any;
  expiresAt: number;
  timer: NodeJS.Timeout;
}

/**
 * Method decorator that memoizes results in memory for `ttl` milliseconds,
 * keyed by the call arguments.
 *
 * - Cache hits skip every other surge-kit layer (`@UseRelay`, `@RateLimit`, ...).
 * - Only successful results are kept: a rejected Promise or a thrown error is
 *   never cached, and `@Fallback` results are never cached either.
 * - Concurrent calls with the same key share the same pending Promise.
 * - Entries are removed when they expire, so the cache does not grow forever.
 *   Use `maxSize` to also bound the number of entries.
 * - Each instance has its own cache. If the key cannot be built (see
 *   `defaultCacheKey`), the call goes through uncached.
 *
 * This is a small resilience cache, not a replacement for a shared store
 * like Redis.
 *
 * @example
 * class ProductService {
 *   @Cache({ ttl: 5000 })
 *   @UseRelay()
 *   async getProductDetails(id: string) { ... }
 * }
 */
export function Cache(options: CacheOptions): any {
  const { ttl, key = defaultCacheKey, maxSize = Infinity } = options;

  assertNumber('Cache', 'ttl', ttl, 1);
  if (ttl > MAX_TIMER_DELAY) {
    throw new TypeError(`@Cache: "ttl" must be at most ${MAX_TIMER_DELAY}ms (about 24.8 days), got ${ttl}.`);
  }
  if (maxSize !== Infinity) {
    assertInteger('Cache', 'maxSize', maxSize, 1);
  }

  return function (
    _target: any,
    propertyKey: unknown,
    descriptor?: PropertyDescriptor
  ): any {
    const stores = new WeakMap<object, Map<string, CacheEntry>>();
    const sharedStore = new Map<string, CacheEntry>();

    const storeFor = (instance: any): Map<string, CacheEntry> => {
      if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) {
        return sharedStore;
      }
      let store = stores.get(instance);
      if (!store) {
        store = new Map();
        stores.set(instance, store);
      }
      return store;
    };

    const remove = (store: Map<string, CacheEntry>, cacheKey: string, entry: CacheEntry) => {
      if (store.get(cacheKey) === entry) {
        clearTimeout(entry.timer);
        store.delete(cacheKey);
      }
    };

    return decorateMethod('Cache', propertyKey, descriptor, LayerRank.CACHE, (next) => (invocation) => {
      let cacheKey: string;
      try {
        cacheKey = key(...invocation.args);
      } catch {
        return next(invocation);
      }

      const store = storeFor(invocation.thisArg);
      const hit = store.get(cacheKey);
      if (hit && hit.expiresAt > monotonicNow()) {
        // Re-insert to mark it as most recently used.
        store.delete(cacheKey);
        store.set(cacheKey, hit);
        return hit.value;
      }
      if (hit) {
        remove(store, cacheKey, hit);
      }

      const value = next(invocation);

      const entry: CacheEntry = {
        value,
        expiresAt: monotonicNow() + ttl,
        timer: setTimeout(() => remove(store, cacheKey, entry), ttl),
      };
      // Expiry timers alone should not keep the process alive.
      entry.timer.unref();
      store.set(cacheKey, entry);

      if (store.size > maxSize) {
        const [oldestKey, oldest] = store.entries().next().value as [string, CacheEntry];
        remove(store, oldestKey, oldest);
      }

      if (value && typeof value.then === 'function') {
        value.then(undefined, () => remove(store, cacheKey, entry));
      }

      return value;
    });
  };
}
