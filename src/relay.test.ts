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

  beforeEach(() => {
    mockSuccessFn.mockClear();
    mockFailureFn.mockClear();
    relay = new Relay();
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
});