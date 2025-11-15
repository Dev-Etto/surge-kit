Read this in other languages: [Português (Brasil)](./README.pt-BR.md)

# Surge Kit

![NPM Version](https://img.shields.io/npm/v/surge-kit)
![Build Status](https://img.shields.io/github/actions/workflow/status/Dev-Etto/surge-kit/main.yml?branch=main)
![Test Coverage](https://img.shields.io/codecov/c/github/Dev-Etto/surge-kit)
![NPM Downloads](https://img.shields.io/npm/dm/surge-kit)

A **lightweight**, **zero-dependency**, and **modern** Circuit Breaker library for Node.js, built with a focus on `async/await` and TypeScript.

---

## 💡 Why use surge-kit?

Protecting your applications from failures in external services shouldn't require installing heavy and complex libraries.

* **⚡ Extremely Lightweight:** Zero dependencies. The library size is tiny.
* **🔌 Modern API:** A clean and intuitive API that uses `async/await` and `...rest parameters`.
* **🛡️ Resilience (Fail-Fast):** Prevents your application from hanging while trying to call services that are already offline by failing quickly.
* **🎧 Observability:** Emits events so you can log and monitor the health of your circuits (using `EventEmitter`).
* **🎯 Native TypeScript:** Written entirely in TypeScript for an excellent developer experience.

## 📦 Installation

```bash
npm install surge-kit
```

## 🚀 Quick Start
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
| `onFallback` | `(err: Error) => Promise<any>` | `null` | A fallback function to execute when the circuit is `OPEN` or a call fails. |

**Example:**

If an `onFallback` function is provided, `relay.run()` will execute it instead of throwing an error. This allows you to serve cached data or a default response.

```ts
// (Example: A function to get cached data)
async function getCachedShipping() {
  return { price: 10.00, source: 'cache' };
}

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

## 3. Observability (Events)
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

## 📜 License
Distributed under the [MIT License](LICENSE).

Copyright (c) 2025 João Neto - [DevEtto](https://github.com/Dev-Etto).
