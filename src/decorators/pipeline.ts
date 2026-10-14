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
 * The state of one call travelling through the pipeline.
 */
export interface Invocation {
  thisArg: any;
  args: any[];
  /**
   * Set once an outer layer stopped waiting for the inner ones (e.g. the relay
   * timed out). Inner layers must not start new work, such as another retry.
   */
  abandoned: boolean;
}

export type Step = (invocation: Invocation) => any;

/**
 * Receives the next (inner) step and returns the step that replaces it.
 * Layers are re-applied whenever a layer is added, so any state shared
 * between calls must live outside of this function.
 */
export type Layer = (next: Step) => Step;

interface Pipeline {
  original: Method;
  layers: ReadonlyArray<{ rank: number; wrap: Layer }>;
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
 * Whether the method's pipeline already has a layer of the given rank.
 */
export function hasLayer(method: Method, rank: number): boolean {
  return getPipeline(method)?.layers.some((layer) => layer.rank === rank) ?? false;
}

/**
 * Returns a new entry point with the layer added to the method's pipeline.
 * Pipelines are never changed in place, so a decorated method shared with
 * another class (e.g. a mixin) is not affected by decorating the copy.
 */
export function addLayer(method: Method, rank: number, wrap: Layer): Method {
  const existing = getPipeline(method);
  const pipeline: Pipeline = {
    original: existing?.original ?? method,
    layers: [...(existing?.layers ?? []), { rank, wrap }],
  };

  // Lower ranks sit closer to the original method. The sort is stable, so
  // among equal ranks a layer added later wraps the ones added before it.
  const original = pipeline.original;
  const composed = [...pipeline.layers]
    .sort((a, b) => a.rank - b.rank)
    .reduce<Step>(
      (next, layer) => layer.wrap(next),
      (invocation) => original.apply(invocation.thisArg, invocation.args)
    );

  const entry = function (this: any, ...args: any[]) {
    return composed({ thisArg: this, args, abandoned: false });
  };
  Object.defineProperty(entry, 'name', { value: original.name });
  (entry as any)[PIPELINE] = pipeline;
  return entry;
}

/**
 * Throws a clear error when a decorator is used as a TC39 standard decorator
 * (TypeScript without `experimentalDecorators`), which passes a context
 * object instead of a property key and descriptor.
 */
export function assertLegacyDecorator(decorator: string, propertyKeyOrContext: unknown): void {
  if (typeof propertyKeyOrContext === 'object' && propertyKeyOrContext !== null) {
    throw new TypeError(
      `@${decorator}: surge-kit decorators require "experimentalDecorators": true in tsconfig.json.`
    );
  }
}

/**
 * Applies a layer to a decorated method.
 */
export function decorateMethod(
  decorator: string,
  propertyKey: unknown,
  descriptor: PropertyDescriptor | undefined,
  rank: number,
  wrap: Layer
): PropertyDescriptor {
  assertLegacyDecorator(decorator, propertyKey);
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new TypeError(`@${decorator} can only be applied to methods.`);
  }

  descriptor.value = addLayer(descriptor.value, rank, wrap);
  return descriptor;
}

/**
 * Applies a layer to every method on a class prototype accepted by `filter`,
 * which receives the method as currently installed (possibly decorated).
 * Returns how many methods were decorated.
 */
export function decorateClassMethods(
  constructor: { prototype: any },
  rank: number,
  wrap: (methodName: string) => Layer,
  filter: (method: Method) => boolean = () => true
): number {
  const prototype = constructor.prototype;
  let decorated = 0;

  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (methodName === 'constructor') continue;

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor || typeof descriptor.value !== 'function') continue;
    if (!filter(descriptor.value)) continue;

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
  next: Step,
  invocation: Invocation,
  onError: (error: Error) => any
): any {
  let result: any;
  try {
    result = next(invocation);
  } catch (error) {
    return onError(error as Error);
  }

  if (result && typeof result.then === 'function') {
    // Adopt any thenable, not only Promises (which always have `catch`).
    return Promise.resolve(result).catch(onError);
  }
  return result;
}
