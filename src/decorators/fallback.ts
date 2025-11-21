
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
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): any {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const executeFallback = (error: Error) => {
        if (typeof fallback === 'string') {
          const fallbackMethod = (this as any)[fallback];
          if (typeof fallbackMethod === 'function') {
            return fallbackMethod.apply(this, [error, ...args]);
          } else {
            throw new Error(`Fallback method '${fallback}' not found on instance.`);
          }
        } else if (typeof fallback === 'function') {
          return fallback(error as Error, ...args);
        }
        throw error;
      };

      try {
        const result = originalMethod.apply(this, args);
        // If the result is a Promise, handle async errors
        if (result && typeof result.then === 'function') {
          return (result as Promise<any>).catch(executeFallback);
        }
        // Otherwise, return the synchronous result
        return result;
      } catch (error) {
        // Handle synchronous errors
        return executeFallback(error as Error);
      }
    };

    return descriptor;
  };
}
