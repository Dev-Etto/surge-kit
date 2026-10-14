import { decorateMethod, LayerRank } from './pipeline';
import { assertInteger, assertNumber } from './validate';

export interface CacheOptions {
  /**
   * Time in milliseconds a result stays cached.
   */
  ttl: number;
  /**
   * Builds the cache key from the call arguments.
   * @default (...args) => JSON.stringify(args)
   */
  key?: (...args: any[]) => string;
  /**
   * Maximum number of entries kept per instance. When exceeded, the least
   * recently used entry is evicted.
   * @default Infinity
   */
  maxSize?: number;
}

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
 * - Each instance has its own cache. If the key cannot be built (e.g.
 *   circular arguments), the call goes through uncached.
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
  const { ttl, key = (...args: any[]) => JSON.stringify(args), maxSize = Infinity } = options;

  assertNumber('Cache', 'ttl', ttl, 1);
  if (maxSize !== Infinity) {
    assertInteger('Cache', 'maxSize', maxSize, 1);
  }

  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
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

    return decorateMethod(descriptor, LayerRank.CACHE, (next) =>
      function (this: any, ...args: any[]) {
        let cacheKey: string;
        try {
          cacheKey = key(...args);
        } catch {
          return next.apply(this, args);
        }

        const store = storeFor(this);
        const hit = store.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) {
          // Re-insert to mark it as most recently used.
          store.delete(cacheKey);
          store.set(cacheKey, hit);
          return hit.value;
        }
        if (hit) {
          remove(store, cacheKey, hit);
        }

        const value = next.apply(this, args);

        const entry: CacheEntry = {
          value,
          expiresAt: Date.now() + ttl,
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
      }
    );
  };
}
