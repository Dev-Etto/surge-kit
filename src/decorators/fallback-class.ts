/**
 * Class decorator to define a fallback class.
 * When used with @RelayClass, if the primary class methods fail,
 * the corresponding methods from the fallback class will be called.
 * 
 * @param FallbackClass The fallback class constructor.
 */
export function FallbackClass<T extends { new (...args: any[]): {} }>(
  FallbackClass: T
): any {
  return function <U extends { new (...args: any[]): {} }>(constructor: U): any {
    const prototype = constructor.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (descriptor && typeof descriptor.value === 'function') {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
          try {
            return await originalMethod.apply(this, args);
          } catch (error) {
            const fallbackInstance = new FallbackClass();
            
            const fallbackMethod = (fallbackInstance as any)[methodName];
            
            if (typeof fallbackMethod === 'function') {
              return fallbackMethod.call(fallbackInstance, error, ...args);
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
