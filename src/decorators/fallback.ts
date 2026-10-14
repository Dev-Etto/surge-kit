import { callWithErrorHandler, decorateMethod, LayerRank } from './pipeline';


/**
 * Decorator to define a fallback method in case of failure.
 * 
 * @param fallback A method name (string) on the same class, or a standalone function.
 * 
 * @remarks
 * This decorator preserves the synchronous or asynchronous nature of the original method:
 * - Synchronous methods remain synchronous
 * - Asynchronous methods (or methods returning Promises) remain asynchronous
 * 
 * @example
 * ```typescript
 * class ApiService {
 *   @Fallback('fallbackData')
 *   async fetchData(id: number) {
 *     // async method with fallback
 *   }
 *   
 *   async fallbackData(error: Error, id: number) {
 *     return { id, cached: true };
 *   }
 * }
 * ```
 */
export function Fallback(fallback: string | ((error: Error, ...args: any[]) => any)): any {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): any {
    return decorateMethod(descriptor, LayerRank.FALLBACK, (next) =>
      function (this: any, ...args: any[]) {
        return callWithErrorHandler(next, this, args, (error) => {
          if (typeof fallback === 'function') {
            return fallback(error, ...args);
          }

          if (typeof fallback !== 'string') {
            throw error;
          }

          const fallbackMethod = this[fallback];
          if (typeof fallbackMethod !== 'function') {
            throw new Error(`Fallback method '${fallback}' not found on instance.`);
          }
          return fallbackMethod.apply(this, [error, ...args]);
        });
      }
    );
  };
}
