import { EventEmitter } from 'events';
import {
  RelayOptions,
  RelayEvents,
  RelayState,
  InternalOptions,
} from './types';
import { RelayOpenError } from './errors';

export class Relay extends EventEmitter {
  #state: RelayState = RelayState.CLOSED;
  #failureCount = 0;
  #lastFailureTime = 0;
  #coolDownTimer: NodeJS.Timeout | null = null;
  readonly #options: InternalOptions;

constructor(options: RelayOptions = {}) {
    super();

    this.#options = {
      failureThreshold: options.failureThreshold ?? 5,
      coolDownPeriod: options.coolDownPeriod ?? 30000,
      executionTimeout: options.executionTimeout ?? 10000,
      onFallback: options.onFallback ?? null,
    };}

  /**
   * Executes a function protected by the Relay.
   * @param fn The asynchronous function to be executed.
   * @param args Arguments to be passed to the function.
   */
  public async run<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    ...args: Parameters<T>
  ): Promise<ReturnType<T>> {

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
        reject(new Error('Execution timed out'));
      }, this.#options.executionTimeout);
    });

    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Opens the relay (changes state to OPEN) and schedules the cooldown.
   */
  #open(error: Error) {
    this.#state = RelayState.OPEN;
    this.#lastFailureTime = Date.now();
    this.emit(RelayEvents.OPEN, error);

    this.#coolDownTimer = setTimeout(() => {
      this.#halfOpen();
    }, this.#options.coolDownPeriod);
  }

  /**
   * Closes the relay (changes state to CLOSED).
   */
  #close() {
    this.#state = RelayState.CLOSED;
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
}