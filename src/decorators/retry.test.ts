import { Relay } from '../relay';
import { RelayOpenError } from '../errors';
import { RelayState } from '../types';
import { Retry } from './retry';
import { UseRelay } from './use-relay';

jest.useFakeTimers();

describe('@Retry', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should resolve once a later attempt succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('blip 1'))
      .mockRejectedValueOnce(new Error('blip 2'))
      .mockResolvedValue('ok');

    class Service {
      @Retry({ attempts: 3 })
      async call() { return fn(); }
    }

    await expect(new Service().call()).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw the last error after all attempts fail', async () => {
    let attempt = 0;
    class Service {
      @Retry({ attempts: 3 })
      async call() { throw new Error(`fail ${++attempt}`); }
    }

    await expect(new Service().call()).rejects.toThrow('fail 3');
    expect(attempt).toBe(3);
  });

  it('should wait between attempts with exponential backoff capped by maxDelay', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    class Service {
      @Retry({ attempts: 4, delay: 100, backoff: 2, maxDelay: 150 })
      async call() { return fn(); }
    }

    // Capture the outcome now so the rejection is handled while time advances.
    const outcome = new Service().call().catch((error: Error) => error);

    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // 100 * 2 = 200, capped at 150.
    await jest.advanceTimersByTimeAsync(149);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(150);
    expect(fn).toHaveBeenCalledTimes(4);
    expect(await outcome).toMatchObject({ message: 'fail' });
  });

  it('should stop retrying when retryIf returns false', async () => {
    const retryIf = jest.fn((error: Error) => error.message !== 'fatal');
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('fatal'))
      .mockResolvedValue('never');

    class Service {
      @Retry({ attempts: 5, retryIf })
      async call() { return fn(); }
    }

    await expect(new Service().call()).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retryIf).toHaveBeenLastCalledWith(expect.any(Error), 2);
  });

  it('should pass arguments and "this" to every attempt', async () => {
    class Service {
      private calls = 0;
      constructor(private prefix: string) {}

      @Retry({ attempts: 2 })
      async call(value: string) {
        if (++this.calls === 1) throw new Error('fail');
        return `${this.prefix}-${value}`;
      }
    }

    await expect(new Service('svc').call('x')).resolves.toBe('svc-x');
  });

  it.each([
    [{ attempts: 0 }, '"attempts" must be an integer >= 1'],
    [{ attempts: 1.5 }, '"attempts" must be an integer >= 1'],
    [{ attempts: 2, delay: -1 }, '"delay" must be a number >= 0'],
    [{ attempts: 2, backoff: 0.5 }, '"backoff" must be a number >= 1'],
    [{ attempts: 2, maxDelay: Number.NaN }, '"maxDelay" must be a number >= 0'],
  ])('should reject invalid options %p', (options, message) => {
    expect(() => Retry(options as any)).toThrow(message);
  });

  describe('with @UseRelay', () => {
    let relay: Relay;

    beforeEach(() => {
      relay = new Relay({ failureThreshold: 1, coolDownPeriod: 1000 });
    });

    afterEach(() => {
      relay.cleanup();
    });

    it.each([
      ['@Retry above @UseRelay', (fn: () => Promise<string>) => {
        class Service {
          @Retry({ attempts: 3 })
          @UseRelay(relay)
          async call() { return fn(); }
        }
        return new Service();
      }],
      ['@UseRelay above @Retry', (fn: () => Promise<string>) => {
        class Service {
          @UseRelay(relay)
          @Retry({ attempts: 3 })
          async call() { return fn(); }
        }
        return new Service();
      }],
    ])('should hide recovered failures from the relay (%s)', async (_, create) => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('blip'))
        .mockResolvedValue('ok');

      await expect(create(fn).call()).resolves.toBe('ok');
      expect(relay.getMetrics()).toMatchObject({ failures: 0, successes: 1 });
      expect(relay.state).toBe(RelayState.CLOSED);
    });

    it('should count a single relay failure when every attempt fails', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('down'));
      class Service {
        @Retry({ attempts: 3 })
        @UseRelay(relay)
        async call() { return fn(); }
      }

      await expect(new Service().call()).rejects.toThrow('down');
      expect(fn).toHaveBeenCalledTimes(3);
      expect(relay.getMetrics().failures).toBe(1);
      expect(relay.state).toBe(RelayState.OPEN);
    });

    it('should not retry while the relay is OPEN', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('down'));
      class Service {
        @Retry({ attempts: 3 })
        @UseRelay(relay)
        async call() { return fn(); }
      }
      const service = new Service();
      await expect(service.call()).rejects.toThrow('down');
      fn.mockClear();

      await expect(service.call()).rejects.toThrow(RelayOpenError);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
