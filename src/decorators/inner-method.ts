/**
 * Fallback decorators wrap a method in a plain function that catches errors.
 * They expose the method they wrap through this slot so relay decorators can
 * protect the inner method instead of the wrapper. This keeps the fallback
 * outermost (so it also sees `RelayOpenError` and failures already counted by
 * the relay) regardless of the order the decorators are written in.
 */
const INNER_SLOT = Symbol('surge-kit.innerMethod');

export interface InnerMethodSlot {
  fn: (...args: any[]) => any;
}

/**
 * Attaches to a wrapper the slot holding the method it calls through.
 */
export function attachInnerSlot(
  wrapper: (...args: any[]) => any,
  slot: InnerMethodSlot
): void {
  (wrapper as any)[INNER_SLOT] = slot;
}

/**
 * Returns the innermost slot of a chain of fallback wrappers, if any.
 */
export function getInnerSlot(method: any): InnerMethodSlot | undefined {
  let slot: InnerMethodSlot | undefined = method?.[INNER_SLOT];
  while (slot && (slot.fn as any)[INNER_SLOT]) {
    slot = (slot.fn as any)[INNER_SLOT];
  }
  return slot;
}
