import { Relay } from '../relay';
import { BulkheadRejectedError } from '../errors';
import { Bulkhead } from './bulkhead';
import { Fallback } from './fallback';
import { UseRelay } from './use-relay';

const deferred = <T = string>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('@Bulkhead', () => {
  it('should reject calls over maxConcurrent without invoking the method', async () => {
    const pending = [deferred(), deferred()];
    const fn = jest.fn((i: number) => pending[i].promise);

    class Service {
      @Bulkhead({ maxConcurrent: 2 })
      async call(i: number) { return fn(i); }
    }
    const service = new Service();

    const first = service.call(0);
    const second = service.call(1);
    const rejected = service.call(2);

    await expect(rejected).rejects.toBeInstanceOf(BulkheadRejectedError);
    await expect(rejected).rejects.toMatchObject({ maxConcurrent: 2, maxQueue: 0 });
    expect(fn).toHaveBeenCalledTimes(2);

    pending[0].resolve('a');
    pending[1].resolve('b');
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
  });

  it('should free the slot when a call succeeds, rejects or throws synchronously', async () => {
    let mode: 'ok' | 'reject' | 'throw' = 'ok';
    class Service {
      @Bulkhead({ maxConcurrent: 1 })
      call() {
        if (mode === 'throw') throw new Error('sync');
        return mode === 'ok' ? Promise.resolve('ok') : Promise.reject(new Error('async'));
      }
    }
    const service = new Service();

    await expect(service.call()).resolves.toBe('ok');
    mode = 'reject';
    await expect(service.call()).rejects.toThrow('async');
    mode = 'throw';
    await expect(service.call()).rejects.toThrow('sync');
    mode = 'ok';
    await expect(service.call()).resolves.toBe('ok');
  });

  it('should queue calls up to maxQueue and start them in FIFO order', async () => {
    const running = deferred();
    const order: string[] = [];

    class Service {
      @Bulkhead({ maxConcurrent: 1, maxQueue: 2 })
      async call(id: string) {
        order.push(id);
        if (id === 'first') return running.promise;
        return id;
      }
    }
    const service = new Service();

    const first = service.call('first');
    const second = service.call('second');
    const third = service.call('third');
    await expect(service.call('fourth')).rejects.toBeInstanceOf(BulkheadRejectedError);

    await Promise.resolve();
    expect(order).toEqual(['first']);

    running.resolve('first');
    await expect(Promise.all([first, second, third])).resolves.toEqual(['first', 'second', 'third']);
    expect(order).toEqual(['first', 'second', 'third']);

    // Every slot is free again.
    await expect(service.call('fifth')).resolves.toBe('fifth');
  });

  it('should share the limit across instances of the class', async () => {
    const running = deferred();
    class Service {
      @Bulkhead({ maxConcurrent: 1 })
      async call() { return running.promise; }
    }

    const first = new Service().call();
    await expect(new Service().call()).rejects.toBeInstanceOf(BulkheadRejectedError);

    running.resolve('done');
    await first;
  });

  it('should not count rejections as relay failures and let @Fallback handle them', async () => {
    const relay = new Relay({ failureThreshold: 1 });
    const running = deferred();

    class Service {
      @UseRelay(relay)
      @Bulkhead({ maxConcurrent: 1 })
      @Fallback((error: Error) => error.name)
      async call() { return running.promise; }
    }
    const service = new Service();

    const first = service.call();
    await expect(service.call()).resolves.toBe('BulkheadRejectedError');
    expect(relay.getMetrics().failures).toBe(0);

    running.resolve('done');
    await expect(first).resolves.toBe('done');
    relay.cleanup();
  });

  it.each([
    [{ maxConcurrent: 0 }, '"maxConcurrent" must be an integer >= 1'],
    [{ maxConcurrent: 1, maxQueue: -1 }, '"maxQueue" must be an integer >= 0'],
  ])('should reject invalid options %p', (options, message) => {
    expect(() => Bulkhead(options as any)).toThrow(message);
  });
});
