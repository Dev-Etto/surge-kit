import { Relay } from '../relay';
import { RateLimitExceededError } from '../errors';
import { Fallback } from './fallback';
import { RateLimit } from './rate-limit';
import { Retry } from './retry';
import { UseRelay } from './use-relay';

jest.useFakeTimers();

describe('@RateLimit', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should allow `limit` calls per window and reject the rest', async () => {
    const fn = jest.fn(async () => 'ok');
    class Service {
      @RateLimit({ limit: 2, windowMs: 1000 })
      async call() { return fn(); }
    }
    const service = new Service();

    await expect(service.call()).resolves.toBe('ok');
    jest.advanceTimersByTime(400);
    await expect(service.call()).resolves.toBe('ok');

    const rejected = service.call();
    await expect(rejected).rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(rejected).rejects.toMatchObject({ limit: 2, windowMs: 1000, retryAfterMs: 600 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should accept calls again as older ones leave the sliding window', async () => {
    class Service {
      @RateLimit({ limit: 2, windowMs: 1000 })
      async call() { return 'ok'; }
    }
    const service = new Service();

    await service.call(); // t=0
    jest.advanceTimersByTime(500);
    await service.call(); // t=500
    await expect(service.call()).rejects.toBeInstanceOf(RateLimitExceededError);

    jest.advanceTimersByTime(500); // t=1000: the first call left the window
    await expect(service.call()).resolves.toBe('ok');
    await expect(service.call()).rejects.toBeInstanceOf(RateLimitExceededError);

    jest.advanceTimersByTime(500); // t=1500: the second call left the window
    await expect(service.call()).resolves.toBe('ok');
  });

  it('should not consume the limit with rejected calls', async () => {
    class Service {
      @RateLimit({ limit: 1, windowMs: 1000 })
      async call() { return 'ok'; }
    }
    const service = new Service();

    await service.call();
    await expect(service.call()).rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(service.call()).rejects.toBeInstanceOf(RateLimitExceededError);

    jest.advanceTimersByTime(1000);
    await expect(service.call()).resolves.toBe('ok');
  });

  it('should share the limit across instances of the class', async () => {
    class Service {
      @RateLimit({ limit: 1, windowMs: 1000 })
      async call() { return 'ok'; }
    }

    await new Service().call();
    await expect(new Service().call()).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('should count a call retried by @Retry as a single call', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue('ok');

    class Service {
      @RateLimit({ limit: 1, windowMs: 1000 })
      @Retry({ attempts: 2 })
      async call() { return fn(); }
    }
    const service = new Service();

    await expect(service.call()).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    await expect(service.call()).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('should not count rejections as relay failures and let @Fallback handle them', async () => {
    const relay = new Relay({ failureThreshold: 1 });

    class Service {
      @Fallback((error: Error) => error.name)
      @UseRelay(relay)
      @RateLimit({ limit: 1, windowMs: 1000 })
      async call() { return 'ok'; }
    }
    const service = new Service();

    await expect(service.call()).resolves.toBe('ok');
    await expect(service.call()).resolves.toBe('RateLimitExceededError');
    expect(relay.getMetrics().failures).toBe(0);
    relay.cleanup();
  });

  it.each([
    [{ limit: 0, windowMs: 1000 }, '"limit" must be an integer >= 1'],
    [{ limit: 1, windowMs: 0 }, '"windowMs" must be a number >= 1'],
  ])('should reject invalid options %p', (options, message) => {
    expect(() => RateLimit(options as any)).toThrow(message);
  });
});
