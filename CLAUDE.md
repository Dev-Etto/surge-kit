# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`surge-kit` is a zero-dependency Circuit Breaker library for Node.js (>=20, see `.nvmrc`), written in TypeScript and published to npm. The circuit breaker class is called `Relay`. Keep it at zero runtime dependencies: only Node built-ins (e.g. `events`) may be imported.

## Commands

```bash
npm run build                 # clean + tsc → dist/ (test files excluded)
npm test                      # jest (ts-jest), coverage always on
npm run lint                  # eslint src/**/*.ts
npx jest src/relay.test.ts    # single test file
npx jest -t "should open"     # single test by name
```

`prepublishOnly` runs lint → test → build.

## Architecture

- **`src/relay.ts`**: `Relay` extends `EventEmitter` and holds all state in `#private` fields. `run(fn, ...args)` is the only execution path. It races `fn` against `executionTimeout`. On success it resets `failureCount` and closes the circuit if it was HALF_OPEN. On failure it increments counters and opens the circuit once `failureThreshold` is reached. HALF_OPEN lets a single trial call through (`#trialInFlight`), and concurrent calls get `RelayOpenError`. Only the trial's outcome closes or reopens the circuit. Late results from calls started before the relay opened update metrics but not state. Timeouts reject with `RelayTimeoutError`. OPEN schedules a `setTimeout` (fixed or exponential backoff capped at `maxCooldown`) that moves to HALF_OPEN. While OPEN, calls are not attempted and a `RelayOpenError` is produced instead.
- **Fallback resolution** (`#executeFallback`): first a fallback registered via `relay.register(primary, fallback)` (a `Map` keyed by function identity; with objects it maps methods by name across the prototype chain and installs bound copies on the primary so `relay.run(obj.method)` works without `.bind()`. It does not apply to `@UseRelay` methods, which call `relay.run` with a per-call closure), then the global `onFallback` option, otherwise the error is rethrown. Registered fallbacks receive `(error, ...originalArgs)`; `onFallback` receives only `error`.
- **Default instance**: `Relay.setDefault/getDefault/clearDefault` is a static singleton used when decorators get no relay argument. `getDefault()` throws if none is set, and it runs at **decoration time** (class definition), not at call time.
- **`src/types.ts`**: `RelayState` and `RelayEvents` are `as const` objects with matching type aliases (not TS enums). Option defaults live in the `Relay` constructor and are documented in the JSDoc `@default` tags on `RelayOptions`. Keep the two in sync.

### Decorators (`src/decorators/`)

They use legacy `experimentalDecorators` (enabled in both `tsconfig.json` and the inline ts-jest config in `jest.config.js`). All of them work by replacing `descriptor.value` / prototype methods.

- `@UseRelay(relay?)` works as both a method decorator and a class decorator. `@RelayClass(relay)` is a deprecated alias of class-level `@UseRelay`.
- `@Fallback(methodName | fn)` and `@FallbackClass(Cls)` catch both sync throws and rejected promises. `@FallbackClass` lazily creates one fallback instance per primary instance (stored under a Symbol) and calls the same-named method with `(error, ...args)`.
- **Decorators compose via a ranked pipeline** (`src/decorators/pipeline.ts`): each decorator calls `decorateMethod` / `decorateClassMethods` to add a layer with a `LayerRank` instead of wrapping the method directly. Layers are sorted by rank, so the order the decorators are written in never matters. From the outside in: `Fallback → Cache → Bulkhead → RateLimit → Relay → Retry → method`. The reasons: fallback results are never cached, cache hits bypass everything, bulkhead and rate-limit rejections are not counted as relay failures, and retries are hidden from the relay.
  - A layer is `(next: Step) => Step`, where a step receives an `Invocation` (`thisArg`, `args`, `abandoned`). The relay layer sets `abandoned` once it settles, including on timeout, so inner layers (`@Retry`) stop starting new work.
  - `addLayer` never mutates a pipeline. It returns a new entry function, so decorated methods shared between classes (mixins) stay independent.
  - Layer functions are re-applied on every `addLayer`, so per-method state (counters, queues, cache stores) must be created in the decorator closure, not inside the layer.
  - A new decorator must pick a rank and call `assertLegacyDecorator`. That check fails clearly when the decorator is used without `experimentalDecorators`.
- `@Bulkhead` and `@RateLimit` state is shared across instances (per decorated method). `@Cache` stores are per instance (`WeakMap`). Option validation (`src/decorators/validate.ts`) throws `TypeError` at decoration time. Measure intervals with `monotonicNow()` and pass delays through `clampTimerDelay()` (`src/timers.ts`). `Date.now()` jumps with clock adjustments, and `setTimeout` overflows above 2^31-1 ms and fires after 1ms. `@Cache`'s `defaultCacheKey` refuses lossy arguments (Map, Set, opaque objects), so those calls go uncached instead of colliding.
- Class-level `@UseRelay` only wraps methods whose `constructor.name === 'AsyncFunction'` and emits a `SURGE_KIT_NO_ASYNC_METHODS` process warning when it finds none.
- New decorators must be re-exported from `src/decorators/index.ts`, which `src/index.ts` re-exports. New error classes go in `src/errors.ts` and must set `this.name`.

## Testing conventions

Tests sit next to the source (`*.test.ts`) and use `jest.useFakeTimers()`. Call `relay.cleanup()` (which clears the cooldown timer) and `Relay.clearDefault()` in `afterEach` so timers and the singleton don't leak between tests. ESLint allows `any` and ignores unused vars or args that start with `_`.

## Repo conventions

- Git-flow branching: work on `feature/*` branches off `develop`, which is the default/PR branch. Releases go through `release/vX.Y.Z` branches.
- Docs exist in two languages: `README.md` and `README.pt-BR.md`. Update both when the public API changes.
