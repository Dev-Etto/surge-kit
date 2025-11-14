import { EventEmitter } from 'events';
import {
  CircuitBreakerOptions,
  CircuitEvents,
  CircuitState,
} from './types';
import { CircuitOpenError } from './errors';

export class CircuitBreaker extends EventEmitter {
  #state: CircuitState = CircuitState.CLOSED;
  #failureCount: number = 0;
  #lastFailureTime: number = 0;
  #coolDownTimer: NodeJS.Timeout | null = null;
  readonly #options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    super();

    this.#options = {
      failureThreshold: options.failureThreshold ?? 5,
      coolDownPeriod: options.coolDownPeriod ?? 30000,
      executionTimeout: options.executionTimeout ?? 10000,
    };
  }

  /**
   * Executes a function protected by the Circuit Breaker.
   * @param fn The asynchronous function to be executed.
   * @param args Arguments to be passed to the function.
   */
  public async exec<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    ...args: Parameters<T>
  ): Promise<ReturnType<T>> {
    if (this.#state === CircuitState.OPEN) {
      throw new CircuitOpenError();
    }

    try {
      const result = await this.#executeWithTimeout(fn, args);

      this.#handleSuccess();

      return result;
    } catch (error) {
      this.#handleFailure(error as Error);

      throw error;
    }
  }

  /**
   * Handles a successful execution.
   */
  #handleSuccess() {
    this.#failureCount = 0;

    if (this.#state === CircuitState.HALF_OPEN) {
      this.#close();
    }

    this.emit(CircuitEvents.SUCCESS);
  }

  /**
   * Handles a failed execution.
   */
  #handleFailure(error: Error) {
    this.#failureCount++;
    this.emit(CircuitEvents.FAILURE, error);

    if (
      this.#failureCount >= this.#options.failureThreshold &&
      this.#state !== CircuitState.OPEN
    ) {
      this.#open(error);
    }
  }

  /**
   * Executes the user's function, racing against a timeout.
   */
  #executeWithTimeout<T extends (...args: any[]) => Promise<any>>(
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
   * Opens the circuit (changes state to OPEN) and schedules the cooldown.
   */
  #open(error: Error) {
    this.#state = CircuitState.OPEN;
    this.#lastFailureTime = Date.now();
    this.emit(CircuitEvents.OPEN, error);

    this.#coolDownTimer = setTimeout(() => {
      this.#halfOpen();
    }, this.#options.coolDownPeriod);
  }

  /**
   * Closes the circuit (changes state to CLOSED).
   */
  #close() {
    this.#state = CircuitState.CLOSED;
    this.#failureCount = 0;

    if (this.#coolDownTimer) {
      clearTimeout(this.#coolDownTimer);

      this.#coolDownTimer = null;
    }

    this.emit(CircuitEvents.CLOSE);
  }

  /**
   * Enters the half-open state to test the service.
   */
  #halfOpen() {
    this.#state = CircuitState.HALF_OPEN;

    this.emit(CircuitEvents.HALF_OPEN);
  }

  public get state(): CircuitState {
    return this.#state;
  }

  public get lastFailureTime(): number {
    return this.#lastFailureTime;
  }
}