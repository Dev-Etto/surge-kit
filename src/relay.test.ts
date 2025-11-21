import { Relay, RelayOpenError, RelayState } from './index';

jest.useFakeTimers();

const mockSuccessFn = jest.fn(async () => {
  return 'success';
});

const mockFailureFn = jest.fn(async () => {
  throw new Error('Failure');
});

describe('Relay', () => {

  let relay: Relay;
  const failureThreshold = 2;
  const coolDownPeriod = 1000; 

  beforeEach(() => {
    mockSuccessFn.mockClear();
    mockFailureFn.mockClear();
    relay = new Relay();
  });

  afterEach(() => {
    relay.cleanup();
    Relay.clearDefault();
    jest.clearAllTimers();
  });

  it('should start in the CLOSED state', () => {
    expect(relay.state).toBe(RelayState.CLOSED);
  });
  
  it('should execute a successful function and remain CLOSED', async () => {
    const result = await relay.run(mockSuccessFn);
    
    expect(result).toBe('success');
    expect(mockSuccessFn).toHaveBeenCalledTimes(1);
    expect(relay.state).toBe(RelayState.CLOSED);
  });
  
  it('should OPEN after failures, go to HALF_OPEN after coolDown, and CLOSE after a success', async () => {
    const options = {
      failureThreshold: 2,
      coolDownPeriod: 5000,
    };
    relay = new Relay(options);

    expect(relay.state).toBe(RelayState.CLOSED);

    await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
    expect(relay.state).toBe(RelayState.CLOSED);

    await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
    
    expect(relay.state).toBe(RelayState.OPEN);
    expect(mockFailureFn).toHaveBeenCalledTimes(2);

    await expect(relay.run(mockFailureFn)).rejects.toThrow(RelayOpenError);
    expect(mockFailureFn).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(5000);
    expect(relay.state).toBe(RelayState.HALF_OPEN);

    const result = await relay.run(mockSuccessFn);
    expect(result).toBe('success');
    expect(relay.state).toBe(RelayState.CLOSED);
    
    await relay.run(mockSuccessFn);
    expect(relay.state).toBe(RelayState.CLOSED);
    expect(mockSuccessFn).toHaveBeenCalledTimes(2);
  });

  it('should fail with a timeout if the function takes too long', async () => {
    const options = {
      failureThreshold: 1,
      executionTimeout: 2000,
    };
    relay = new Relay(options);

    const mockSlowFn = jest.fn(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve('slow success');
        }, 3000); 
      });
    });

    const executionPromise = relay.run(mockSlowFn);

    jest.advanceTimersByTime(2500);

    await expect(executionPromise).rejects.toThrow('Execution timed out');
    expect(relay.state).toBe(RelayState.OPEN);
  });

  it('should update lastFailureTime after opening', async () => {
    const options = { failureThreshold: 1 };
    relay = new Relay(options);

    expect(relay.lastFailureTime).toBe(0);

    await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');

    expect(relay.lastFailureTime).toBeGreaterThan(0);
    expect(relay.state).toBe(RelayState.OPEN);
  });

  it('should call onFallback and not throw when circuit is OPEN', async () => {
    const fallbackFn = jest.fn(async () => {
      return 'fallback-result';
    });
    
    relay = new Relay({
      failureThreshold: 1,
      onFallback: fallbackFn,
    });

    await expect(relay.run(mockFailureFn)).resolves.toBe('fallback-result');
    expect(relay.state).toBe(RelayState.OPEN);
    expect(fallbackFn).toHaveBeenCalledTimes(1);

    fallbackFn.mockClear();

    await expect(relay.run(mockSuccessFn)).resolves.toBe('fallback-result');

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    expect(fallbackFn).toHaveBeenCalledWith(expect.any(RelayOpenError));

    expect(mockSuccessFn).not.toHaveBeenCalled();
  });

  it('should call onFallback on a regular failure and not throw', async () => {

    const fallbackFn = jest.fn(async () => {
      return 'fallback-on-fail';
    });

    relay = new Relay({
      failureThreshold: 5,
      onFallback: fallbackFn,
    });

    await expect(relay.run(mockFailureFn)).resolves.toBe('fallback-on-fail');

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    expect(fallbackFn).toHaveBeenCalledWith(expect.any(Error));
    expect(fallbackFn).not.toHaveBeenCalledWith(expect.any(RelayOpenError));


    expect(relay.state).toBe(RelayState.CLOSED);
  });

  it('should correctly type the onFallback return value when using generics', async () => {
    interface FallbackResponse {
      status: string;
      data: { id: number };
    }

    const fallbackData: FallbackResponse = {
      status: 'cached',
      data: { id: 123 },
    };

    const fallbackFn = jest.fn(async (): Promise<FallbackResponse> => {
      return fallbackData;
    });

    const typedRelay = new Relay<FallbackResponse>({
      failureThreshold: 1,
      onFallback: fallbackFn,
    });

    const result = await typedRelay.run(mockFailureFn);

    expect(result).toEqual(fallbackData);
  });

    it('should initialize metrics with zero values', () => {
    const relay = new Relay();
    const metrics = relay.getMetrics();

    expect(metrics.successes).toBe(0);
    expect(metrics.failures).toBe(0);
    expect(metrics.timeouts).toBe(0);
    expect(metrics.total).toBe(0);
    expect(metrics.state).toBe(RelayState.CLOSED);
  });

  it('should increment success count on successful calls', async () => {
    const successfulCall = jest.fn().mockResolvedValue('OK');
    const relay = new Relay();

    await relay.run(successfulCall);
    await relay.run(successfulCall);

    const metrics = relay.getMetrics();
    expect(metrics.successes).toBe(2);
    expect(metrics.failures).toBe(0);
    expect(metrics.total).toBe(2);
  });

  it('should increment failure count on failed calls', async () => {
    const failingCall = jest.fn().mockRejectedValue(new Error('Failure'));
    const relay = new Relay({ failureThreshold: 5 });

    try {
      await relay.run(failingCall);
    } catch (_) {
      // Expected to fail
    }
    try {
      await relay.run(failingCall);
    } catch (_) {
      // Expected to fail
    }

    const metrics = relay.getMetrics();
    expect(metrics.failures).toBe(2);
    expect(metrics.successes).toBe(0);
    expect(metrics.total).toBe(2);
  });

  it('should increment timeout and failure counts when calls time out', async () => {
    const slowCall = jest.fn(
      () => new Promise(resolve => setTimeout(() => resolve('OK'), 200)),
    );
    const relay = new Relay({ executionTimeout: 100 });

    const promise = relay.run(slowCall);
    jest.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow('Execution timed out');

    const metrics = relay.getMetrics();
    expect(metrics.timeouts).toBe(1);
    expect(metrics.failures).toBe(1);
    expect(metrics.total).toBe(1);
  });

    it('should not use exponential backoff by default', async () => {
      const relay = new Relay({ failureThreshold, coolDownPeriod });

      await expect(relay.run(mockFailureFn)).rejects.toThrow();
      await expect(relay.run(mockFailureFn)).rejects.toThrow();
      expect(relay.state).toBe(RelayState.OPEN);

      jest.advanceTimersByTime(coolDownPeriod);
      expect(relay.state).toBe(RelayState.HALF_OPEN);
    });

    it('should increase cooldown period exponentially on consecutive opens', async () => {
      const relay = new Relay({
        failureThreshold,
        coolDownPeriod,
        useExponentialBackoff: true,
      });

      await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
      await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
      expect(relay.state).toBe(RelayState.OPEN);

      jest.advanceTimersByTime(coolDownPeriod);
      expect(relay.state).toBe(RelayState.HALF_OPEN);

      await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
      expect(relay.state).toBe(RelayState.OPEN);

      jest.advanceTimersByTime(coolDownPeriod);
      expect(relay.state).toBe(RelayState.OPEN);

      jest.advanceTimersByTime(coolDownPeriod);
      expect(relay.state).toBe(RelayState.HALF_OPEN);
    });

    it('should not exceed maxCooldown when using exponential backoff', async () => {
      const maxCooldown = 2500;
      const relay = new Relay({
        failureThreshold: 1,
        coolDownPeriod,
        useExponentialBackoff: true,
        maxCooldown,
      });

      await expect(relay.run(mockFailureFn)).rejects.toThrow();
      jest.advanceTimersByTime(1000);
      await expect(relay.run(mockFailureFn)).rejects.toThrow();

      jest.advanceTimersByTime(2000);
      await expect(relay.run(mockFailureFn)).rejects.toThrow();

      jest.advanceTimersByTime(maxCooldown - 1);
      expect(relay.state).toBe(RelayState.OPEN);

      jest.advanceTimersByTime(1);
      expect(relay.state).toBe(RelayState.HALF_OPEN); 
    });

    it('should reset the backoff counter after a successful call closes the circuit', async () => {
      const relay = new Relay({
        failureThreshold: 1,
        coolDownPeriod,
        useExponentialBackoff: true,
      });

      await expect(relay.run(mockFailureFn)).rejects.toThrow(); 
      jest.advanceTimersByTime(coolDownPeriod);
      await expect(relay.run(mockSuccessFn)).resolves.toBe('success');
      await expect(relay.run(mockFailureFn)).rejects.toThrow();  


      jest.advanceTimersByTime(coolDownPeriod);
      expect(relay.state).toBe(RelayState.HALF_OPEN);
    });
});

describe('Relay Register', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 1 });
  });

  it('should use registered fallback for a function', async () => {
    const primary = jest.fn(async () => { throw new Error('fail'); });
    const fallback = jest.fn(async () => 'fallback');

    relay.register(primary, fallback);

    await expect(relay.run(primary)).resolves.toBe('fallback');
    expect(fallback).toHaveBeenCalled();
  });

  it('should use registered fallback for object methods', async () => {
    class Primary {
      async exec() { throw new Error('fail'); }
    }
    class Fallback {
      async exec() { return 'fallback'; }
    }

    const p = new Primary();
    const f = new Fallback();

    relay.register(p, f);
    
    await expect(relay.run(p.exec)).resolves.toBe('fallback');
  });

  it('should use registered fallback for object literals', async () => {
    const primary = {
      async exec() { throw new Error('fail'); }
    };
    const fallback = {
      async exec() { return 'fallback'; }
    };

    relay.register(primary, fallback);
    
    await expect(relay.run(primary.exec)).resolves.toBe('fallback');
  });
});

describe('Relay Cleanup', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 1, coolDownPeriod: 5000 });
  });

  afterEach(() => {
    relay.cleanup();
  });

  it('should clear cooldown timer when cleanup is called', async () => {
    // Force the circuit to open
    await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
    expect(relay.state).toBe(RelayState.OPEN);

    // Call cleanup before the cooldown period ends
    relay.cleanup();

    // Advance timers past the cooldown period
    jest.advanceTimersByTime(5000);

    // The circuit should still be OPEN because the timer was cleared
    expect(relay.state).toBe(RelayState.OPEN);
  });

  it('should handle cleanup when no timer is active', () => {
    // Should not throw when there's no active timer
    expect(() => relay.cleanup()).not.toThrow();
    expect(relay.state).toBe(RelayState.CLOSED);
  });

  it('should allow multiple cleanup calls safely', async () => {
    // Force the circuit to open
    await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
    expect(relay.state).toBe(RelayState.OPEN);

    // Multiple cleanup calls should be safe
    expect(() => {
      relay.cleanup();
      relay.cleanup();
      relay.cleanup();
    }).not.toThrow();
  });

  it('should prevent transition to HALF_OPEN after cleanup', async () => {
    // Force the circuit to open
    await expect(relay.run(mockFailureFn)).rejects.toThrow('Failure');
    expect(relay.state).toBe(RelayState.OPEN);

    // Cleanup before cooldown completes
    relay.cleanup();

    // Advance time well past the cooldown period
    jest.advanceTimersByTime(10000);

    // Circuit should remain OPEN (not transition to HALF_OPEN)
    expect(relay.state).toBe(RelayState.OPEN);
  });

  it('should be safe to call cleanup in CLOSED state', () => {
    expect(relay.state).toBe(RelayState.CLOSED);
    expect(() => relay.cleanup()).not.toThrow();
    expect(relay.state).toBe(RelayState.CLOSED);
  });

  it('should cleanup timer set during exponential backoff', async () => {
    const relayWithBackoff = new Relay({
      failureThreshold: 1,
      coolDownPeriod: 1000,
      useExponentialBackoff: true,
    });

    // Open the circuit
    await expect(relayWithBackoff.run(mockFailureFn)).rejects.toThrow('Failure');
    expect(relayWithBackoff.state).toBe(RelayState.OPEN);

    // Cleanup the timer
    relayWithBackoff.cleanup();

    // Advance time past the exponential backoff period
    jest.advanceTimersByTime(5000);

    // Should still be OPEN because timer was cleared
    expect(relayWithBackoff.state).toBe(RelayState.OPEN);

    relayWithBackoff.cleanup();
  });
});