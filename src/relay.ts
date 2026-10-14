import { EventEmitter } from 'events';
import {
  RelayOptions,
  RelayEvents,
  RelayState,
  InternalOptions,
  RelayMetrics,
} from './types';
import { RelayOpenError, RelayTimeoutError } from './errors';
import { clampTimerDelay } from './timers';

export class Relay<TFallback = any> extends EventEmitter {
  private static defaultInstance: Relay | null = null;

  #failureCount = 0;
  #lastFailureTime = 0;
  #successCount = 0;
  #totalFailureCount = 0;
  #timeoutCount = 0;
  #state: RelayState = RelayState.CLOSED;
  #consecutiveOpenCount = 0;
  #coolDownTimer: NodeJS.Timeout | null = null;
  #trialInFlight = false;

  readonly #options: InternalOptions<TFallback>;
  #fallbackRegistry = new Map<(...args: any[]) => any, (...args: any[]) => any>();

  constructor(options: RelayOptions<TFallback> = {}) {
    super();

    this.#options = {
      failureThreshold: options.failureThreshold ?? 5,
      coolDownPeriod: options.coolDownPeriod ?? 30000,
      executionTimeout: options.executionTimeout ?? 10000,
      useExponentialBackoff: options.useExponentialBackoff ?? false,
      maxCooldown: options.maxCooldown ?? 600000,
      onFallback: (options.onFallback as any) ?? null,
    };
  }

  /**
   * Sets the default Relay instance to be used by decorators when no instance is provided.
   * @param instance The Relay instance to set as default.
   */
  public static setDefault(instance: Relay): void {
    Relay.defaultInstance = instance;
  }

  /**
   * Gets the default Relay instance.
   * @throws Error if no default instance has been set.
   * @returns The default Relay instance.
   */
  public static getDefault(): Relay {
    if (!Relay.defaultInstance) {
      throw new Error(
        'No default Relay instance set. Use Relay.setDefault() first or provide a Relay instance to the decorator.'
      );
    }
    return Relay.defaultInstance;
  }

  /**
   * Clears the default Relay instance.
   * Useful for test cleanup to avoid state pollution between tests.
   */
  public static clearDefault(): void {
    Relay.defaultInstance = null;
  }

  /**
   * Cleans up any pending timers.
   * Useful for test cleanup to prevent resource leaks.
   */
  public cleanup(): void {
    if (this.#coolDownTimer) {
      clearTimeout(this.#coolDownTimer);
      this.#coolDownTimer = null;
    }
  }

  /**
   * Registers a primary implementation and its fallback.
   * Useful when you can't use decorators.
   *
   * When objects are given, each primary method with a same-named fallback is
   * replaced on the primary object by a copy bound to it, so it can be passed
   * directly as `relay.run(primary.method)` without `.bind()`.
   * @param primary The primary object or function.
   * @param fallback The fallback object or function.
   */
  public register<
    P extends (...args: any[]) => Promise<any>,
    F extends (error: Error, ...args: Parameters<P>) => Promise<any>
  >(primary: P, fallback: F): void;
  public register<P extends object, F extends object>(primary: P, fallback: F): void;
  public register(primary: any, fallback: any): void {
    if (typeof primary === 'function' && typeof fallback === 'function') {
      this.#fallbackRegistry.set(primary, fallback);
    } else if (typeof primary === 'object' && typeof fallback === 'object') {
      const methodNames = new Set<string>();
      // Walk the prototype chain so own properties (object literals) and
      // inherited class methods are both registered.
      for (
        let current = primary;
        current && current !== Object.prototype;
        current = Object.getPrototypeOf(current)
      ) {
        Object.getOwnPropertyNames(current).forEach((name) => methodNames.add(name));
      }

      for (const method of methodNames) {
        if (
          method !== 'constructor' &&
          typeof primary[method] === 'function' &&
          typeof fallback[method] === 'function'
        ) {
          // Bind so fallback methods keep access to their own `this`.
          const boundFallback = fallback[method].bind(fallback);
          const original = primary[method];
          this.#fallbackRegistry.set(original, boundFallback);

          // Install a bound copy on the instance so `relay.run(obj.method)`
          // keeps `this` without `.bind()`, which would create an unregistered function.
          const own = Object.getOwnPropertyDescriptor(primary, method);
          const canInstall = own
            ? own.configurable || own.writable
            : Object.isExtensible(primary);
          if (canInstall) {
            const bound = original.bind(primary);
            Object.defineProperty(primary, method, {
              value: bound,
              writable: own?.writable ?? true,
              enumerable: own?.enumerable ?? false,
              configurable: own?.configurable ?? true,
            });
            this.#fallbackRegistry.set(bound, boundFallback);
          }
        }
      }
    }
  }

  /**
   * Executes a function protected by the Relay.
   * @param fn The asynchronous function to be executed.
   * @param args Arguments to be passed to the function.
   */
  public async run<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>> | TFallback> {

    // While HALF_OPEN only a single trial call is allowed through; concurrent
    // calls are rejected as if the relay were still OPEN.
    if (
      this.#state === RelayState.OPEN ||
      (this.#state === RelayState.HALF_OPEN && this.#trialInFlight)
    ) {
      const openError = new RelayOpenError();
      return this.#executeFallback(fn, openError, args);
    }

    // The trial call's outcome moves the relay to CLOSED or OPEN, so the flag
    // only needs resetting when HALF_OPEN is entered again.
    const isTrial = this.#state === RelayState.HALF_OPEN;
    if (isTrial) {
      this.#trialInFlight = true;
    }

    try {
      const result = await this.#runWithTimeout(fn, args);
      this.#handleSuccess(isTrial);
      return result;
    } catch (error) {
      this.#handleFailure(error as Error, isTrial);
      return this.#executeFallback(fn, error as Error, args);
    }
  }

  /**
   * Handles a successful execution.
   */
  #handleSuccess(isTrial: boolean) {
    this.#successCount++;
    this.#failureCount = 0;

    // In HALF_OPEN only the trial call decides the outcome; calls that started
    // before the relay opened and settle late do not.
    if (this.#state === RelayState.HALF_OPEN && isTrial) {
      this.#close();
    }

    this.emit(RelayEvents.SUCCESS);
  }

  /**
   * Handles a failed execution.
   */
  #handleFailure(error: Error, isTrial: boolean) {
    this.#totalFailureCount++;
    this.#failureCount++;
    this.emit(RelayEvents.FAILURE, error);

    // A failed trial call in HALF_OPEN reopens the relay immediately,
    // regardless of the consecutive failure count.
    if (
      (this.#state === RelayState.HALF_OPEN && isTrial) ||
      (this.#state === RelayState.CLOSED &&
        this.#failureCount >= this.#options.failureThreshold)
    ) {
      this.#open(error);
    }
  }

  /**
   * Executes the user's function, racing against a timeout.
   */
  #runWithTimeout<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    args: Parameters<T>
  ): Promise<ReturnType<T>> {
    const executionPromise = fn(...args);
    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.#timeoutCount++;
        reject(new RelayTimeoutError(this.#options.executionTimeout));
      }, clampTimerDelay(this.#options.executionTimeout));
    });

    // Clear the timer once the race settles so it neither counts a timeout
    // after a successful call nor keeps the process alive.
    return Promise.race([executionPromise, timeoutPromise]).finally(() =>
      clearTimeout(timer)
    );
  }

  /**
   * Executes the fallback logic if available.
   */
  async #executeFallback(
    fn: (...args: any[]) => any,
    error: Error,
    args: any[]
  ): Promise<any> {
    const registeredFallback = this.#fallbackRegistry.get(fn);
    if (registeredFallback) {
      return registeredFallback(error, ...args);
    }

    if (this.#options.onFallback) {
      return this.#options.onFallback(error);
    }

    throw error;
  }

  /**
   * Opens the relay (changes state to OPEN) and schedules the cooldown.
   */
  #open(error: Error) {
    this.#consecutiveOpenCount++;
    this.#state = RelayState.OPEN;
    this.#lastFailureTime = Date.now();
    this.emit(RelayEvents.OPEN, error);

    const coolDownPeriod = this.#calculateCooldown();

    this.#coolDownTimer = setTimeout(() => {
      this.#coolDownTimer = null;
      this.#halfOpen();
    }, clampTimerDelay(coolDownPeriod));
    // The cooldown alone should not keep the process alive.
    this.#coolDownTimer.unref();
  }

  /**
   * Calculates the cooldown period, applying exponential backoff if enabled.
   */
  #calculateCooldown(): number {
    if (!this.#options.useExponentialBackoff) {
      return this.#options.coolDownPeriod;
    }
    const multiplier = 2 ** (this.#consecutiveOpenCount - 1);
    const backoffCooldown = this.#options.coolDownPeriod * multiplier;
    return Math.min(backoffCooldown, this.#options.maxCooldown);
  }

  /**
   * Closes the relay (changes state to CLOSED).
   */
  #close() {
    this.#state = RelayState.CLOSED;
    this.#consecutiveOpenCount = 0;
    this.#failureCount = 0;

    this.emit(RelayEvents.CLOSE);
  }

  /**
   * Enters the half-open state to test the service.
   */
  #halfOpen() {
    this.#state = RelayState.HALF_OPEN;
    this.#trialInFlight = false;

    this.emit(RelayEvents.HALF_OPEN);
  }

  public get state(): RelayState {
    return this.#state;
  }

  public get lastFailureTime(): number {
    return this.#lastFailureTime;
  }

  /**
   * Returns a snapshot of the relay's current metrics.
   */
  public getMetrics(): RelayMetrics {
    return {
      state: this.#state,
      successes: this.#successCount,
      failures: this.#totalFailureCount,
      timeouts: this.#timeoutCount,
      total: this.#successCount + this.#totalFailureCount,
    };
  }
}