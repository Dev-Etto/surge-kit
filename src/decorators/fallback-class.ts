import { callWithErrorHandler, decorateClassMethods, LayerRank } from './pipeline';

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
    // One fallback instance per primary instance, created on first failure.
    const fallbackInstanceSymbol = Symbol('fallbackInstance');

    decorateClassMethods(constructor, LayerRank.FALLBACK, (methodName) => (next) =>
      function (this: any, ...args: any[]) {
        return callWithErrorHandler(next, this, args, (error) => {
          this[fallbackInstanceSymbol] ??= new FallbackClass();
          const fallbackInstance = this[fallbackInstanceSymbol];
          const method = fallbackInstance[methodName];

          if (typeof method !== 'function') {
            throw error;
          }
          return method.call(fallbackInstance, error, ...args);
        });
      }
    );

    return constructor;
  };
}
