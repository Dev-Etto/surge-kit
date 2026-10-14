/**
 * Option validation shared by the decorators. Errors are thrown when the
 * decorator is applied (class definition time), not when the method is called.
 */
export function assertInteger(decorator: string, name: string, value: unknown, min: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new TypeError(`@${decorator}: "${name}" must be an integer >= ${min}, got ${String(value)}.`);
  }
}

export function assertNumber(decorator: string, name: string, value: unknown, min: number): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min) {
    throw new TypeError(`@${decorator}: "${name}" must be a number >= ${min}, got ${String(value)}.`);
  }
}
