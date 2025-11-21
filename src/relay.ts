import { EventEmitter } from 'events';
import {
  RelayOptions,
  RelayEvents,
  RelayState,
  InternalOptions,
  RelayMetrics,
} from './types';
import { RelayOpenError } from './errors';

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
      const methodNames =
        Object.getPrototypeOf(primary) === Object.prototype
          ? Object.getOwnPropertyNames(primary) // For object literals
          : Object.getOwnPropertyNames(Object.getPrototypeOf(primary)); // For class instances

      for (const method of methodNames) {
        if (
          method !== 'constructor' &&
          typeof primary[method] === 'function' &&
          typeof fallback[method] === 'function'
        ) {
          this.#fallbackRegistry.set(primary[method], fallback[method]);
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

    if (this.#state === RelayState.OPEN) {
      const openError = new RelayOpenError();
      return this.#executeFallback(fn, openError, args);
    }

    try {
      const result = await this.#runWithTimeout(fn, args);
      this.#handleSuccess();
      return result;
    } catch (error) {
      this.#handleFailure(error as Error);
      return this.#executeFallback(fn, error as Error, args);
    }
  }

  /**
   * Handles a successful execution.
   */
  #handleSuccess() {
    this.#successCount++;
    this.#failureCount = 0;

    if (this.#state === RelayState.HALF_OPEN) {
      this.#close();
    }

    this.emit(RelayEvents.SUCCESS);
  }

  /**
   * Handles a failed execution.
   */
  #handleFailure(error: Error) {
    this.#totalFailureCount++;
    this.#failureCount++;
    this.emit(RelayEvents.FAILURE, error);

    if (
      this.#failureCount >= this.#options.failureThreshold &&
      this.#state !== RelayState.OPEN
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

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        this.#timeoutCount++;
        reject(new Error('Execution timed out'));
      }, this.#options.executionTimeout);
    });

    return Promise.race([executionPromise, timeoutPromise]);
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
      this.#halfOpen();
    }, coolDownPeriod);
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

    if (this.#coolDownTimer) {
      clearTimeout(this.#coolDownTimer);

      this.#coolDownTimer = null;
    }

    this.emit(RelayEvents.CLOSE);
  }

  /**
   * Enters the half-open state to test the service.
   */
  #halfOpen() {
    this.#state = RelayState.HALF_OPEN;

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