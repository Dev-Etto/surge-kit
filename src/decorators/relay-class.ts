import { Relay } from '../relay';
import { UseRelay } from './use-relay';

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
 * Like class-level `@UseRelay`, it emits a `SURGE_KIT_NO_ASYNC_METHODS` warning
 * when no async method is found.
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
  return UseRelay(relay);
}
