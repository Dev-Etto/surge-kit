/**
 * Class decorator to define a fallback class.
 * When used with @RelayClass or @UseRelay, if the primary class methods fail,
 * the corresponding methods from the fallback class will be called.
 * 
 * @param FallbackClass The fallback class constructor.
 * 
 * @remarks
 * This decorator wraps all methods (both synchronous and asynchronous) with fallback logic
 * while preserving their original behavior:
 * - Synchronous methods remain synchronous
 * - Asynchronous methods (or methods returning Promises) remain asynchronous
 * 
 * @example
 * ```typescript
 * class FallbackApi {
 *   getData(error: Error) {
 *     return 'cached data';
 *   }
 *   
 *   async fetchData(error: Error) {
 *     return 'cached async data';
 *   }
 * }
 * 
 * @FallbackClass(FallbackApi)
 * class PrimaryApi {
 *   getData() {
 *     throw new Error('fail');
 *   }
 *   
 *   async fetchData() {
 *     throw new Error('fail');
 *   }
 * }
 * 
 * const api = new PrimaryApi();
 * api.getData();      // Returns 'cached data' (sync)
 * await api.fetchData(); // Returns 'cached async data' (async)
 * ```
 */
export function FallbackClass<T extends { new (...args: any[]): {} }>(
  FallbackClass: T
): any {
  return function <U extends { new (...args: any[]): {} }>(constructor: U): any {
    const fallbackInstanceSymbol = Symbol('fallbackInstance');
    const prototype = constructor.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (descriptor && typeof descriptor.value === 'function') {
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: any[]) {
          const getFallback = () => {
            if (!(this as any)[fallbackInstanceSymbol]) {
              (this as any)[fallbackInstanceSymbol] = new FallbackClass();
            }
            const fallbackInstance = (this as any)[fallbackInstanceSymbol];
            return {
              instance: fallbackInstance,
              method: (fallbackInstance as any)[methodName],
            };
          };

          try {
            const result = originalMethod.apply(this, args);

            // If the result is a Promise, handle async failures
            if (result && typeof result.then === 'function') {
              return (result as Promise<any>).catch((error: any) => {
                const { instance, method } = getFallback();
                if (typeof method === 'function') {
                  return method.call(instance, error, ...args);
                }
                throw error;
              });
            }

            // Otherwise, return the synchronous result
            return result;
          } catch (error) {
            // Handle synchronous failures
            const { instance, method } = getFallback();
            if (typeof method === 'function') {
              return method.call(instance, error, ...args);
            }
            throw error;
          }
        };

        Object.defineProperty(prototype, methodName, descriptor);
      }
    }

    return constructor;
  };
}

