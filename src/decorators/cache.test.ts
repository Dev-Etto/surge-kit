import { Relay } from '../relay';
import { RelayState } from '../types';
import { Cache } from './cache';
import { Fallback } from './fallback';
import { UseRelay } from './use-relay';

jest.useFakeTimers();

describe('@Cache', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should return the cached result within the ttl and call again after it', async () => {
    const fn = jest.fn(async (id: string) => `product-${id}`);
    class Service {
      @Cache({ ttl: 1000 })
      async get(id: string) { return fn(id); }
    }
    const service = new Service();

    await expect(service.get('1')).resolves.toBe('product-1');
    jest.advanceTimersByTime(999);
    await expect(service.get('1')).resolves.toBe('product-1');
    expect(fn).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await expect(service.get('1')).resolves.toBe('product-1');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should key entries by arguments', async () => {
    const fn = jest.fn(async (a: number, b: number) => a + b);
    class Service {
      @Cache({ ttl: 1000 })
      async sum(a: number, b: number) { return fn(a, b); }
    }
    const service = new Service();

    await service.sum(1, 2);
    await service.sum(2, 1);
    await service.sum(1, 2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should share a pending Promise between concurrent calls', async () => {
    const fn = jest.fn(async () => 'value');
    class Service {
      @Cache({ ttl: 1000 })
      async get() { return fn(); }
    }
    const service = new Service();

    const [a, b] = await Promise.all([service.get(), service.get()]);
    expect([a, b]).toEqual(['value', 'value']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not cache rejections or synchronous throws', async () => {
    let fail = true;
    class Service {
      @Cache({ ttl: 1000 })
      async getAsync() {
        if (fail) throw new Error('async');
        return 'ok';
      }

      @Cache({ ttl: 1000 })
      getSync() {
        if (fail) throw new Error('sync');
        return 'ok';
      }
    }
    const service = new Service();

    await expect(service.getAsync()).rejects.toThrow('async');
    expect(() => service.getSync()).toThrow('sync');

    fail = false;
    await expect(service.getAsync()).resolves.toBe('ok');
    expect(service.getSync()).toBe('ok');
  });

  it('should keep synchronous methods synchronous', () => {
    const fn = jest.fn((n: number) => n * 2);
    class Service {
      @Cache({ ttl: 1000 })
      double(n: number) { return fn(n); }
    }
    const service = new Service();

    expect(service.double(2)).toBe(4);
    expect(service.double(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should keep a separate cache per instance', async () => {
    class Service {
      constructor(private name: string) {}

      @Cache({ ttl: 1000 })
      async get() { return this.name; }
    }

    await expect(new Service('a').get()).resolves.toBe('a');
    await expect(new Service('b').get()).resolves.toBe('b');
  });

  it('should use a shared cache when called without an instance', () => {
    const fn = jest.fn(() => 'value');
    class Service {
      @Cache({ ttl: 1000 })
      get() { return fn(); }
    }
    const { get } = new Service();

    get.call(undefined);
    get.call(undefined);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use a custom key and bypass the cache when the key cannot be built', async () => {
    const fn = jest.fn(async (user: { id: number }) => user.id);
    class Service {
      @Cache({ ttl: 1000, key: (user: { id: number }) => String(user.id) })
      async get(user: { id: number }) { return fn(user); }

      @Cache({ ttl: 1000 })
      async getDefaultKey(user: unknown) { return fn(user as { id: number }); }
    }
    const service = new Service();

    await service.get({ id: 1 });
    await service.get({ id: 1 });
    expect(fn).toHaveBeenCalledTimes(1);

    const circular: any = { id: 2 };
    circular.self = circular;
    await service.getDefaultKey(circular);
    await service.getDefaultKey(circular);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should evict the least recently used entry beyond maxSize', async () => {
    const fn = jest.fn(async (id: string) => id);
    class Service {
      @Cache({ ttl: 1000, maxSize: 2 })
      async get(id: string) { return fn(id); }
    }
    const service = new Service();

    await service.get('a');
    await service.get('b');
    await service.get('a'); // 'a' becomes the most recently used
    await service.get('c'); // evicts 'b'
    expect(fn).toHaveBeenCalledTimes(3);

    await service.get('a');
    await service.get('c');
    expect(fn).toHaveBeenCalledTimes(3);

    await service.get('b');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should ignore an expired entry even if its timer has not fired yet', async () => {
    const fn = jest.fn(async () => 'value');
    class Service {
      @Cache({ ttl: 1000 })
      async get() { return fn(); }
    }
    const service = new Service();

    await service.get();
    jest.setSystemTime(Date.now() + 1000);
    await service.get();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should serve cache hits without going through an OPEN relay', async () => {
    const relay = new Relay({ failureThreshold: 1 });
    let fail = false;

    class Service {
      @UseRelay(relay)
      @Cache({ ttl: 1000 })
      async get(id: string) {
        if (fail) throw new Error('down');
        return id;
      }
    }
    const service = new Service();

    await service.get('cached');
    fail = true;
    await expect(service.get('other')).rejects.toThrow('down');
    expect(relay.state).toBe(RelayState.OPEN);

    await expect(service.get('cached')).resolves.toBe('cached');
    relay.cleanup();
  });

  it('should never cache fallback results', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue('fresh');

    class Service {
      @Cache({ ttl: 1000 })
      @Fallback(() => 'fallback')
      async get() { return fn(); }
    }
    const service = new Service();

    await expect(service.get()).resolves.toBe('fallback');
    await expect(service.get()).resolves.toBe('fresh');
    await expect(service.get()).resolves.toBe('fresh');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ ttl: 0 }, '"ttl" must be a number >= 1'],
    [{ ttl: 1000, maxSize: 0 }, '"maxSize" must be an integer >= 1'],
  ])('should reject invalid options %p', (options, message) => {
    expect(() => Cache(options as any)).toThrow(message);
  });
});
