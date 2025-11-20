
/**
 * Decorator to define a fallback method in case of failure.
 * @param fallback A method name (string) on the same class, or a standalone function.
 */
export function Fallback(fallback: string | ((error: Error, ...args: any[]) => any)) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        if (typeof fallback === 'string') {
          const fallbackMethod = (this as any)[fallback];
          if (typeof fallbackMethod === 'function') {
            return fallbackMethod.apply(this, [error, ...args]);
          } else {
            throw new Error(`Fallback method '${fallback}' not found on instance.`);
          }
        } 
        else if (typeof fallback === 'function') {
            return fallback(error as Error, ...args);
        }
        
        throw error;
      }
    };

    return descriptor;
  };
}
