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
  #failureCount = 0;
  #lastFailureTime = 0;
  #successCount = 0;
  #totalFailureCount = 0;
  #timeoutCount = 0;
  #state: RelayState = RelayState.CLOSED;
  #consecutiveOpenCount = 0;
  #coolDownTimer: NodeJS.Timeout | null = null;

  readonly #options: InternalOptions<TFallback>;

  constructor(options: RelayOptions<TFallback> = {}) {
    super();

    this.#options = {
      failureThreshold: options.failureThreshold ?? 5,
      coolDownPeriod: options.coolDownPeriod ?? 30000,
      executionTimeout: options.executionTimeout ?? 10000,
      useExponentialBackoff: options.useExponentialBackoff ?? false,
      maxCooldown: options.maxCooldown ?? 600000,
      onFallback: (options.onFallback as any) ?? null,
    };}

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

      if (this.#options.onFallback) {
        return this.#options.onFallback(openError);
      }

      throw openError;
    }

    try {
      const result = await this.#runWithTimeout(fn, args);
      this.#handleSuccess();
      return result;
    } catch (error) {

      this.#handleFailure(error as Error);

      if (this.#options.onFallback) {
        return this.#options.onFallback(error as Error);
      }

      throw error;
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