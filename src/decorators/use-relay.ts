import { Relay } from '../relay';
import { decorateClassMethods, decorateMethod, isAsyncFunction, Layer, LayerRank } from './pipeline';

export const NO_ASYNC_METHODS_WARNING = 'SURGE_KIT_NO_ASYNC_METHODS';

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
 * If no async method is found (e.g. the code was compiled to a target below ES2017),
 * a process warning with code `SURGE_KIT_NO_ASYNC_METHODS` is emitted.
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
    const layer: Layer = (next) =>
      async function (this: any, ...args: any[]) {
        return relayInstance.run(next.bind(this), ...args);
      };

    if (descriptor && propertyKey) {
      return decorateMethod(descriptor, LayerRank.RELAY, layer);
    }

    const protectedCount = decorateClassMethods(target, LayerRank.RELAY, () => layer, isAsyncFunction);

    // Async detection relies on the `async` keyword surviving compilation.
    // Warn instead of silently leaving the class unprotected.
    if (protectedCount === 0) {
      process.emitWarning(
        `surge-kit: no async methods found on class "${target.name}", so none were protected. ` +
          'Class-level decoration only wraps methods declared with `async` ' +
          '(code compiled to a target below ES2017 has none). ' +
          'Apply @UseRelay to individual methods instead.',
        { code: NO_ASYNC_METHODS_WARNING }
      );
    }

    return target;
  };
}
