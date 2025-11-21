<p align="center">
  <img src="./assets/surge-kit-banner1.png" alt="Surge Kit Banner" width="500">
</p>

Read this in other languages: [Português (Brasil)](./README.pt-BR.md)

# Surge Kit

![NPM Version](https://img.shields.io/npm/v/surge-kit)
![Build Status](https://img.shields.io/github/actions/workflow/status/Dev-Etto/surge-kit/main.yml?branch=main)
![Test Coverage](https://img.shields.io/codecov/c/github/Dev-Etto/surge-kit)
![NPM Downloads](https://img.shields.io/npm/dm/surge-kit)

A **lightweight**, **zero-dependency**, and **modern** Circuit Breaker library for Node.js, built with a focus on `async/await` and TypeScript. Protect your services with a clean programmatic API, elegant **TypeScript decorators** (`@UseRelay`, `@Fallback`), or flexible fallback registration—choose the approach that fits your architecture.

---

## 💡 Why use surge-kit?

Protecting your applications from failures in external services shouldn't require installing heavy and complex libraries.

* **⚡ Extremely Lightweight:** Zero dependencies. The library size is tiny.
* **🔌 Modern API:** A clean and intuitive API that uses `async/await` and `...rest parameters`.
* **✨ TypeScript Decorators:** Use `@UseRelay` and `@Fallback` decorators for clean, declarative circuit breaker protection.
* **🛡️ Resilience (Fail-Fast):** Prevents your application from hanging while trying to call services that are already offline by failing quickly.
* **🎧 Observability:** Emits events so you can log and monitor the health of your circuits (using `EventEmitter`).
* **🎯 Native TypeScript:** Written entirely in TypeScript for an excellent developer experience.

## 📦 Installation

```bash
npm install surge-kit
```

## 🚀 Quick Start

### Basic Usage
```ts
import { Relay, RelayOpenError } from 'surge-kit';

// 1. Create an instance
const relay = new Relay();

// 2. Define your asynchronous function
async function calculateShipping(zipCode) {
  // ...your fetch() call logic
}

// 3. Execute your protected function
try {
  const shippingCost = await relay.run(calculateShipping, '01001-000');
  console.log('Shipping:', shippingCost);

} catch (error) {
  // 4. Handle open-circuit errors
  if (error instanceof RelayOpenError) {
    console.warn('Shipping service unavailable, failing fast.');
  } else {
    console.error('Call failed:', error.message);
  }
}
```

### Using Default Instance (Recommended for Single Relay Apps)
```ts
import { Relay, UseRelay } from 'surge-kit';

// 1. Create and set as default
const relay = new Relay();
Relay.setDefault(relay);

// 2. Use decorators without passing the instance
class ShippingService {
  @UseRelay() // No argument needed!
  async calculateShipping(zipCode: string) {
    // ...your fetch() call logic
  }
}
```

## ✨ Using Decorators

You can now use TypeScript decorators to protect your methods cleanly.

**Prerequisite:** Enable `experimentalDecorators: true` in your `tsconfig.json`.

### `@UseRelay(relayInstance?)`

Wraps a method or all methods in a class with `relay.run()`. The relay instance parameter is **optional** - if not provided, it uses `Relay.getDefault()`.

**Method Decoration:**
```ts
import { Relay, UseRelay } from 'surge-kit';

const myRelay = new Relay();

class ApiService {
  @UseRelay(myRelay)
  async fetchData(id: number) {
    // This method is automatically protected
    return await fetch(`/api/data/${id}`);
  }
}
```

**Class Decoration:**
```ts
import { Relay, UseRelay } from 'surge-kit';

const myRelay = new Relay();

@UseRelay(myRelay)
class ApiService {
  async fetchUsers() {
    // Automatically protected
  }

  async fetchPosts() {
    // Automatically protected
  }
}
```

**Using Default Instance:**
```ts
import { Relay, UseRelay } from 'surge-kit';

// Set up once in your app initialization
const myRelay = new Relay();
Relay.setDefault(myRelay);

// Now you can use @UseRelay without arguments!
@UseRelay()
class ApiService {
  async fetchData() {
    // Protected with default relay
  }
}

// Also works on individual methods
class UserService {
  @UseRelay()
  async getUser(id: number) {
    // Protected with default relay
  }
}
```

### `@Fallback(methodName | function)`

Defines a fallback to be executed if the method fails (or if the circuit is open).
- **String:** Name of a method in the same class.
- **Function:** A standalone function.

```ts
class ApiService {
  @Fallback('fallbackData') // Must be ABOVE @UseRelay to catch errors properly
  @UseRelay(myRelay)
  async riskyOperation(id: number) {
    throw new Error('Boom!');
  }

  async fallbackData(error: Error, id: number) {
    return { id, status: 'fallback', error: error.message };
  }
}
```

> [!IMPORTANT]
> **Decorator Order Matters!** Always place `@Fallback` **above** `@UseRelay`. Decorators execute from bottom to top, so `@Fallback` (outer) must wrap `@UseRelay` (inner) to properly catch errors including `RelayOpenError`.

### `@RelayClass(relayInstance)`

**Note:** `@RelayClass` is now superseded by class-level `@UseRelay`, but remains available for backward compatibility.

Protects **all methods** in a class with the circuit breaker.

```ts
import { Relay, RelayClass } from 'surge-kit';

const myRelay = new Relay();

@RelayClass(myRelay)
class ApiService {
  async fetchUsers() {
    // Automatically protected
  }

  async fetchPosts() {
    // Automatically protected
  }
}
```

### `@FallbackClass(FallbackClass)`
Defines a fallback class. If methods fail, the corresponding methods from the fallback class are called.

```ts
import { RelayClass, FallbackClass } from 'surge-kit';

class FallbackApi {
  async getData(error: Error) {
    return 'Cached data';
  }
}

@RelayClass(myRelay)
@FallbackClass(FallbackApi)
class PrimaryApi {
  async getData() {
    throw new Error('Service down');
  }
}

const api = new PrimaryApi();
await api.getData(); // Returns 'Cached data'
```

## 🔄 Fallback without Decorators (`relay.register`)

If you can't use decorators, you can register a fallback implementation for your methods.

```ts
const relay = new Relay();

const primary = {
  async getData() { throw new Error('Fail'); }
};

const fallback = {
  async getData() { return 'Cached Data'; }
};

// Registers fallback.getData as the fallback for primary.getData
relay.register(primary, fallback);

// When you run primary.getData, it will use the fallback on failure
const result = await relay.run(primary.getData); // Returns 'Cached Data'
```

## 📚 API and Usage Patterns

1. `run(fn, ...args)`

## This is the main method. It receives the function to be executed and passes all subsequent arguments to it.

# With a Simple Function
You can pass any function that returns a Promise.

```ts
async function findUser(id) {
  // ...returns Promise<User>
}

// The second argument (123) is passed as 'id' to findUser
const user = await relay.run(findUser, 123);
```

## With a Class Method
When protecting a class method (which depends on **this**), use **.bind()** to ensure that the context (**this**) is preserved.

```ts
class ApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  
  async fetchApi(data) {
    // ...uses this.apiKey to make the call
  }
}

const apiClient = new ApiClient('sk_123');

// Use .bind(apiClient) to "bind" the context
const result = await relay.run(
  apiClient.fetchApi.bind(apiClient), 
  { value: 100 } // 'data' argument
);
```

### 2. Configuration `new Relay(options)`

You can customize the breaker's behavior by passing an options object to the constructor.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `failureThreshold` | `number` | `5` | The number of consecutive failures needed to open the circuit. |
| `coolDownPeriod` | `number` | `30000` | The time in milliseconds the circuit stays `OPEN` before moving to `HALF_OPEN`. |
| `executionTimeout` | `number` | `10000` | The maximum time in milliseconds the function can run before being considered a failure. |
| `useExponentialBackoff` | `boolean` | `false` | If `true`, the `coolDownPeriod` will increase exponentially after each consecutive failure. |
| `maxCooldown` | `number` | `600000` | The maximum `coolDownPeriod` in milliseconds when using exponential backoff. |
| `onFallback` | `(err: Error) => Promise<TFallback>` | `null` | A fallback function to execute when the circuit is `OPEN` or a call fails. |

**Example with Exponential Backoff:**

To avoid overwhelming an unstable service, you can enable exponential backoff. The `coolDownPeriod` will increase with each consecutive failure, giving the service more time to recover.

```ts
const options = {
  failureThreshold: 3,
  coolDownPeriod: 5000,        // Initial cooldown: 5s
  useExponentialBackoff: true,
  maxCooldown: 60000           // Maximum cooldown: 60s
};

const relay = new Relay(options);

// With this configuration:
// - 1st open: 5s cooldown.
// - 2nd consecutive open: 10s cooldown.
// - 3rd consecutive open: 20s cooldown (and so on, up to the 60s maximum).
```
**Example with `onFallback`:**

If an `onFallback` function is provided, `relay.run()` will execute it instead of throwing an error. This allows you to serve cached data or a default response.

```ts
// (Example: A function to get cached data)
async function getCachedShipping() {
  return { price: 10.00, source: 'cache' };
};

const options = {
  failureThreshold: 2,
  coolDownPeriod: 10000,     // 10 seconds
  executionTimeout: 5000,  // 5 seconds
  onFallback: (error) => {
    // Log the error
    logger.warn(`Relay fallback activated due to: ${error.message}`);
    // Return the cached data
    return getCachedShipping();
  }
};

const relay = new Relay(options);

// Now, if calculateShipping fails 2 times,
// subsequent calls will automatically run getCachedShipping()
// instead of throwing a RelayOpenError.
const shippingCost = await relay.run(calculateShipping, '01001-000');
console.log('Shipping:', shippingCost); // { price: 10.00, source: 'cache' }
```

### 3. Default Instance API

For applications using a single Relay instance, you can set it as the default to simplify decorator usage.

#### `Relay.setDefault(instance: Relay)`
Sets the global default Relay instance.

```typescript
const relay = new Relay({ failureThreshold: 3 });
Relay.setDefault(relay);
```

#### `Relay.getDefault(): Relay`
Gets the global default Relay instance. Throws an error if no default has been set.

```typescript
const relay = Relay.getDefault();
```

#### `Relay.clearDefault(): void`
Clears the global default Relay instance. **Essential for test cleanup.**

```typescript
Relay.clearDefault();
```

#### `relay.cleanup(): void`
Clears any pending cooldown timers. **Essential for preventing resource leaks in tests.**

When a Relay circuit opens, it schedules a timer to transition to `HALF_OPEN` state after the cooldown period. If your tests create Relay instances that open circuits, these timers can persist and cause issues like:
- Jest warnings about timers not being cleared
- Memory leaks in test suites
- Unpredictable test behavior

```typescript
const relay = new Relay();
// ... use relay in tests ...
relay.cleanup(); // Clear any pending timers
```

> [!WARNING]
> **Testing with Default Instance**: The default instance is global state. Always call `Relay.clearDefault()` in your test cleanup (e.g., `afterEach`) to prevent test pollution.

**Example Test Setup:**
```typescript
describe('My Service', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 2 });
    Relay.setDefault(relay);
  });

  afterEach(() => {
    relay.cleanup();        // Clear any pending timers
    Relay.clearDefault();   // Clear default instance
  });

  it('should work', async () => {
    // Your tests here
  });
});
```

## 4. Observability (Events)
**Relay** extends **EventEmitter**. You can listen for events to log and monitor the circuit's state.

```ts
import { RelayEvents } from 'surge-kit';

relay.on(RelayEvents.OPEN, (error) => {
  logger.error(' CIRCUIT OPEN. Calls will be blocked.', error);
});

relay.on(RelayEvents.CLOSE, () => {
  logger.info(' CIRCUIT CLOSED. Calls are back to normal.');
});

relay.on(RelayEvents.HALF_OPEN, () => {
  logger.warn(' CIRCUIT HALF-OPEN. Testing the next call.');
});

relay.on(RelayEvents.FAILURE, (error) => {
  logger.warn('Call failed (Relay)', error.message);
});
```

## 4. Metrics and Health

The `surge-kit` It tracks internal metrics of successes, failures, and timeouts, allowing you to monitor the health of your circuit breaker. You can obtain these metrics using the method `getMetrics()`.

```typescript
const relay = new Relay();

// After a few calls...
const metrics = relay.getMetrics();
console.log(metrics);
/*
{
  state: 'CLOSED',
  successes: 10,
  failures: 2,
  timeouts: 1,
  total: 12
}
*/
```

The method `getMetrics()` returns an object with the following structure:

-   `state`: The current state of the relay (`CLOSED`, `OPEN`, or `HALF-OPEN`).
-   `successes`: The total number of successful calls.
-   `failures`: The total number of failed calls (including timeouts).
-   `timeouts`: The total number of calls that exceeded the time limit.
-   `total`: The sum of `successes` the `failures`.

This is particularly useful for exposing the health of your services through a metrics endpoint, for example, with Express:

```typescript
server.get('/metrics/my-service', (req, res) => {
  res.json(relay.getMetrics());
});
```

## 📜 License
Distributed under the [MIT License](LICENSE).

Copyright (c) 2025 João Neto - [DevEtto](https://github.com/Dev-Etto).
