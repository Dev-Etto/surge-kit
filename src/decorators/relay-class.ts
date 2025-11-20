import { Relay } from '../relay';

/**
 * Class decorator to protect all async methods with a Relay (Circuit Breaker).
 * @param relay The Relay instance to use.
 */
export function RelayClass(relay: Relay) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    const prototype = constructor.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (descriptor && typeof descriptor.value === 'function') {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
          return relay.run(originalMethod.bind(this), ...args);
        };

        Object.defineProperty(prototype, methodName, descriptor);
      }
    }

    return constructor;
  };
}
