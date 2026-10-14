import { Relay } from '../relay';
import { RelayState } from '../types';
import { Bulkhead } from './bulkhead';
import { Cache } from './cache';
import { Fallback } from './fallback';
import { FallbackClass } from './fallback-class';
import { RateLimit } from './rate-limit';
import { Retry } from './retry';
import { UseRelay } from './use-relay';

jest.useFakeTimers();

describe('Decorator pipeline', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 1, coolDownPeriod: 1000 });
  });

  afterEach(() => {
    relay.cleanup();
    jest.clearAllTimers();
  });

  it('should compose every decorator in a fixed order regardless of how they are written', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce('fresh')
      .mockRejectedValue(new Error('down'));

    // Deliberately written in reverse of the pipeline order.
    class Service {
      @Retry({ attempts: 2 })
      @UseRelay(relay)
      @RateLimit({ limit: 10, windowMs: 1000 })
      @Bulkhead({ maxConcurrent: 5 })
      @Cache({ ttl: 500 })
      @Fallback((error: Error) => `fallback:${error.name}`)
      async get(id: string) { return fn(id); }
    }
    const service = new Service();

    // Retry recovers the blip inside the relay, then the result is cached.
    await expect(service.get('1')).resolves.toBe('fresh');
    expect(relay.getMetrics()).toMatchObject({ successes: 1, failures: 0 });
    await expect(service.get('1')).resolves.toBe('fresh');
    expect(fn).toHaveBeenCalledTimes(2);

    // A persistent failure exhausts the retries, opens the relay once and is
    // handled by the fallback without being cached.
    await expect(service.get('2')).resolves.toBe('fallback:Error');
    expect(relay.getMetrics().failures).toBe(1);
    expect(relay.state).toBe(RelayState.OPEN);
    await expect(service.get('2')).resolves.toBe('fallback:RelayOpenError');

    // Cache hits still bypass the open relay.
    await expect(service.get('1')).resolves.toBe('fresh');
  });

  it('should keep the method name', () => {
    class Service {
      @Retry({ attempts: 2 })
      @Cache({ ttl: 500 })
      async fetchUser() { return 'user'; }
    }

    expect(Service.prototype.fetchUser.name).toBe('fetchUser');
  });

  it('should leave accessors untouched in class-level decorators', async () => {
    class FallbackService {
      async getData() { return 'fallback'; }
    }

    @UseRelay(relay)
    @FallbackClass(FallbackService)
    class Service {
      get label() { return 'label'; }
      async getData(): Promise<string> { throw new Error('fail'); }
    }
    const service = new Service();

    expect(service.label).toBe('label');
    await expect(service.getData()).resolves.toBe('fallback');
  });
});
