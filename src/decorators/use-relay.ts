import { Relay } from '../relay';

/**
 * Decorator to protect a method or all methods in a class with a Relay (Circuit Breaker).
 * 
 * When applied to a method:
 * - Wraps the method with relay.run()
 * 
 * When applied to a class:
 * - Wraps all async methods in the class with relay.run()
 * - Only methods explicitly declared with `async` keyword are protected
 * - Synchronous methods are not wrapped to preserve their return type
 * 
 * @param relay Optional Relay instance. If not provided, uses Relay.getDefault().
 * 
 * @remarks
 * **Important Limitation (Class-level decoration):**
 * The decorator detects async methods by checking if they are declared with the `async` keyword.
 * Methods that return a Promise but are not declared as `async` will NOT be protected.
 * This is by design to avoid converting synchronous methods into asynchronous ones.
 * 
 * If you need to protect a method that returns a Promise but is not declared as `async`,
 * apply `@UseRelay` directly to that method instead of at the class level.
 * 
 * @example
 * // Method decoration
 * class ApiService {
 *   @UseRelay(myRelay)
 *   async fetchData() { ... }
 * }
 * 
 * @example
 * // Class decoration
 * @UseRelay(myRelay)
 * class ApiService {
 *   async method1() { ... } // ✓ Protected
 *   async method2() { ... } // ✓ Protected
 *   syncMethod() { ... }    // ✓ Not wrapped (preserves sync behavior)
 *   
 *   // ⚠️ NOT protected at class level (not declared as async)
 *   promiseMethod() {
 *     return Promise.resolve('data');
 *   }
 * }
 * 
 * @example
 * // Using default instance
 * Relay.setDefault(myRelay);
 * 
 * @UseRelay() // No argument needed
 * class ApiService {
 *   async fetchData() { ... }
 * }
 * 
 * @example
 * // Protecting a promise-returning method (not async)
 * class ApiService {
 *   @UseRelay(myRelay) // Apply decorator directly to the method
 *   promiseMethod() {
 *     return Promise.resolve('data');
 *   }
 * }
 */
export function UseRelay(relay?: Relay): any {
  return function (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor
  ): any {
    const relayInstance = relay || Relay.getDefault();

    if (descriptor && propertyKey) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        return relayInstance.run(originalMethod.bind(this), ...args);
      };

      return descriptor;
    }

    const prototype = target.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      const methodDescriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      
      if (methodDescriptor && typeof methodDescriptor.value === 'function') {
        const originalMethod = methodDescriptor.value;
        const isAsync = originalMethod.constructor.name === 'AsyncFunction';

        if (isAsync) {
          methodDescriptor.value = async function (...args: any[]) {
            return relayInstance.run(originalMethod.bind(this), ...args);
          };

          Object.defineProperty(prototype, methodName, methodDescriptor);
        }
      }
    }

    return target;
  };
}
