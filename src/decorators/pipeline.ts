/**
 * Every surge-kit method decorator adds a layer to a per-method pipeline
 * instead of wrapping the method directly. Layers are composed by rank, so the
 * resulting behavior does not depend on the order decorators are written in.
 *
 * From outermost to innermost:
 *
 *   Fallback → Cache → Bulkhead → RateLimit → Relay → Retry → method
 *
 * - Fallback is outermost so it handles every error, including rejections
 *   from the layers below, and its results are never cached.
 * - Cache hits skip every other layer.
 * - Bulkhead and RateLimit reject before the relay, so their rejections are
 *   not counted as service failures.
 * - Retry runs inside the relay, so only a call whose attempts all failed is
 *   counted, and nothing is retried while the relay is OPEN.
 */
export const LayerRank = {
  RETRY: 100,
  RELAY: 200,
  RATE_LIMIT: 300,
  BULKHEAD: 400,
  CACHE: 500,
  FALLBACK: 600,
} as const;

export type Method = (...args: any[]) => any;

/**
 * Receives the next (inner) step and returns the function that replaces it.
 * Layers are re-applied whenever a layer is added, so any state shared
 * between calls must live outside of this function.
 */
export type Layer = (next: Method) => Method;

interface Pipeline {
  original: Method;
  layers: { rank: number; wrap: Layer }[];
  composed: Method;
}

const PIPELINE = Symbol('surge-kit.pipeline');

function getPipeline(method: Method): Pipeline | undefined {
  return (method as any)[PIPELINE];
}

/**
 * Returns the undecorated method behind a pipeline entry point.
 */
export function getOriginalMethod(method: Method): Method {
  return getPipeline(method)?.original ?? method;
}

/**
 * Adds a layer to the method's pipeline, creating the pipeline on first use.
 * Returns the function to install as the method.
 */
export function addLayer(method: Method, rank: number, wrap: Layer): Method {
  const existing = getPipeline(method);
  const pipeline: Pipeline = existing ?? { original: method, layers: [], composed: method };

  pipeline.layers.push({ rank, wrap });
  // Lower ranks sit closer to the original method. The sort is stable, so
  // among equal ranks a layer added later wraps the ones added before it.
  pipeline.composed = [...pipeline.layers]
    .sort((a, b) => a.rank - b.rank)
    .reduce((next, layer) => layer.wrap(next), pipeline.original);

  if (existing) {
    return method;
  }

  const entry = function (this: any, ...args: any[]) {
    return pipeline.composed.apply(this, args);
  };
  Object.defineProperty(entry, 'name', { value: method.name });
  (entry as any)[PIPELINE] = pipeline;
  return entry;
}

/**
 * Applies a layer to a decorated method.
 */
export function decorateMethod(
  descriptor: PropertyDescriptor,
  rank: number,
  wrap: Layer
): PropertyDescriptor {
  descriptor.value = addLayer(descriptor.value, rank, wrap);
  return descriptor;
}

/**
 * Applies a layer to every method on a class prototype accepted by `filter`.
 * Returns how many methods were decorated.
 */
export function decorateClassMethods(
  constructor: { prototype: any },
  rank: number,
  wrap: (methodName: string) => Layer,
  filter: (original: Method) => boolean = () => true
): number {
  const prototype = constructor.prototype;
  let decorated = 0;

  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (methodName === 'constructor') continue;

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor || typeof descriptor.value !== 'function') continue;
    if (!filter(getOriginalMethod(descriptor.value))) continue;

    descriptor.value = addLayer(descriptor.value, rank, wrap(methodName));
    Object.defineProperty(prototype, methodName, descriptor);
    decorated++;
  }

  return decorated;
}

/**
 * Whether a function was declared with the `async` keyword.
 */
export function isAsyncFunction(fn: Method): boolean {
  return fn.constructor.name === 'AsyncFunction';
}

/**
 * Calls `next` and routes synchronous throws and promise rejections to
 * `onError`, preserving the synchronous or asynchronous nature of the result.
 */
export function callWithErrorHandler(
  next: Method,
  thisArg: any,
  args: any[],
  onError: (error: Error) => any
): any {
  try {
    const result = next.apply(thisArg, args);
    if (result && typeof result.then === 'function') {
      return (result as Promise<any>).catch(onError);
    }
    return result;
  } catch (error) {
    return onError(error as Error);
  }
}
