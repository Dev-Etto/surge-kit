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

describe('Decorator pipeline regressions', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 1, coolDownPeriod: 1000 });
  });

  afterEach(() => {
    relay.cleanup();
    jest.clearAllTimers();
  });

  it('should not change a decorated method shared with another class', async () => {
    class Base {
      @Retry({ attempts: 2 })
      async run(): Promise<string> { throw new Error('base failure'); }
    }

    class BFallback {
      async run() { return 'B-fallback'; }
    }
    class Mixin {}
    Object.defineProperty(
      Mixin.prototype,
      'run',
      Object.getOwnPropertyDescriptor(Base.prototype, 'run')!
    );
    UseRelay(relay)(Mixin);
    FallbackClass(BFallback)(Mixin);

    await expect(new Base().run()).rejects.toThrow('base failure');
    expect(relay.getMetrics().total).toBe(0);
    await expect((new Mixin() as Base).run()).resolves.toBe('B-fallback');
    expect(relay.getMetrics().failures).toBe(1);
  });

  it('should not protect a method twice with class-level and method-level @UseRelay', async () => {
    const methodRelay = new Relay({ failureThreshold: 5 });
    const warnSpy = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});

    @UseRelay(relay)
    class Service {
      @UseRelay(methodRelay)
      async own(): Promise<string> { throw new Error('fail'); }

      async other(): Promise<string> { throw new Error('fail'); }
    }
    const service = new Service();

    await expect(service.own()).rejects.toThrow('fail');
    expect(methodRelay.getMetrics().failures).toBe(1);
    expect(relay.getMetrics().failures).toBe(0);

    await expect(service.other()).rejects.toThrow('fail');
    expect(relay.getMetrics().failures).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    methodRelay.cleanup();
  });

  it('should treat a successful thenable without .catch as a success', async () => {
    const thenable = { then: (resolve: (v: string) => void) => resolve('value') };
    class Service {
      @Fallback(() => 'fallback')
      get(): any { return thenable; }
    }

    await expect(Promise.resolve(new Service().get())).resolves.toBe('value');
  });

  it('should explain that experimentalDecorators is required', () => {
    const context = { kind: 'method', name: 'get' };
    const method = async () => 'x';

    expect(() => (UseRelay(relay) as any)(method, context)).toThrow('experimentalDecorators');
    expect(() => (Retry({ attempts: 2 }) as any)(method, context)).toThrow('experimentalDecorators');
    expect(() => (FallbackClass(class {}) as any)(class {}, { kind: 'class' })).toThrow(
      'experimentalDecorators'
    );
  });

  it('should reject decorating something that is not a method', () => {
    expect(() => (Cache({ ttl: 1 }) as any)({}, 'field', undefined)).toThrow(
      '@Cache can only be applied to methods.'
    );
  });
});
