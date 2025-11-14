/**
 * Error thrown when an execution is attempted while the circuit is OPEN.
 */
export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit is open. Call was not attempted.');
    this.name = 'CircuitOpenError';
  }
}