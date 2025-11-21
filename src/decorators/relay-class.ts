import { Relay } from '../relay';

/**
 * Class decorator to protect all async methods with a Relay (Circuit Breaker).
 * 
 * @param relay The Relay instance to use.
 * 
 * @deprecated Use class-level `@UseRelay` instead. This decorator is kept for backward compatibility.
 * 
 * @remarks
 * **Important Limitation:**
 * Only methods explicitly declared with the `async` keyword are protected.
 * Methods that return a Promise but are not declared as `async` will NOT be protected.
 * This is by design to avoid converting synchronous methods into asynchronous ones.
 * 
 * If you need to protect a method that returns a Promise but is not declared as `async`,
 * apply `@UseRelay` directly to that method.
 * 
 * @example
 * ```typescript
 * @RelayClass(myRelay)
 * class ApiService {
 *   async method1() { ... } // ✓ Protected
 *   syncMethod() { ... }    // ✓ Not wrapped
 *   
 *   // ⚠️ NOT protected (not declared as async)
 *   promiseMethod() {
 *     return Promise.resolve('data');
 *   }
 * }
 * ```
 */
export function RelayClass(relay: Relay): any {
  return function <T extends { new (...args: any[]): {} }>(constructor: T): any {
    const prototype = constructor.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (descriptor && typeof descriptor.value === 'function') {
        const originalMethod = descriptor.value;
        const isAsync = originalMethod.constructor.name === 'AsyncFunction';

        if (isAsync) {
          descriptor.value = async function (...args: any[]) {
            return relay.run(originalMethod.bind(this), ...args);
          };

          Object.defineProperty(prototype, methodName, descriptor);
        }
      }
    }

    return constructor;
  };
}
