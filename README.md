Read this in other languages: [Português (Brasil)](./README.pt-BR.md)

# Relay

![NPM Version](https://img.shields.io/npm/v/relay)
![Build Status](https://img.shields.io/github/actions/workflow/status/Dev-Etto/relay/.github/workflows/main.yml?branch=main)
![Test Coverage](https://img.shields.io/codecov/c/github/Dev-Etto/relay)
![NPM Downloads](https://img.shields.io/npm/dm/relay)

A **lightweight**, **zero-dependency**, and **modern** Circuit Breaker library for Node.js, built with a focus on `async/await` and TypeScript.

---

## 💡 Why use Relay?

Protecting your applications from failures in external services shouldn't require installing heavy and complex libraries.

*   **⚡ Extremely Lightweight:** Zero dependencies. The library size is tiny.
*   **🔌 Modern API:** A clean and intuitive API that uses `async/await` and `...rest parameters`.
*   **🛡️ Resilience (Fail-Fast):** Prevents your application from hanging while trying to call services that are already offline by failing quickly.
*   **🎧 Observability:** Emits events so you can log and monitor the health of your circuits (using `EventEmitter`).
*   **🎯 Native TypeScript:** Written entirely in TypeScript for an excellent developer experience.

## 📦 Installation

```bash
npm install relay
```

## 🚀 Quick Start
```ts
import { Relay, RelayOpenError } from 'relay';

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
## 2. Configuration new Relay(options)
You can customize the breaker's behavior in the constructor.

```ts
const options = {
  // 3 consecutive failures open the circuit (Default: 5)
  failureThreshold: 3, 
  
  // 10s cooldown before retrying (Default: 30000ms)
  coolDownPeriod: 10000, 
  
  // 5s timeout for the function execution (Default: 10000ms)
  executionTimeout: 5000, 
};

const breaker = new Relay(options);
```

## 3. Observability (Events)
**Relay** extends **EventEmitter**. You can listen for events to log and monitor the circuit's state.

```ts
import { RelayEvents } from 'relay';

breaker.on(RelayEvents.OPEN, (error) => {
  logger.error(' CIRCUIT OPEN. Calls will be blocked.', error);
});

breaker.on(RelayEvents.CLOSE, () => {
  logger.info(' CIRCUIT CLOSED. Calls are back to normal.');
});

breaker.on(RelayEvents.HALF_OPEN, () => {
  logger.warn(' CIRCUIT HALF-OPEN. Testing the next call.');
});

breaker.on(RelayEvents.FAILURE, (error) => {
  logger.warn('Call failed (Circuit Breaker)', error.message);
});
```

## 📜 License
Distributed under the [Licença MIT](LICENSE).

Copyright (c) 2025 João Neto - [DevEtto](https://github.com/Dev-Etto).
