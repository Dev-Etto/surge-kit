Read this in other languages: [English](./README.md)

# Relay

![NPM Version](https://img.shields.io/npm/v/relay)
![Build Status](https://img.shields.io/github/actions/workflow/status/Dev-Etto/relay/.github/main.yml?branch=main)
![Test Coverage](https://img.shields.io/codecov/c/github/Dev-Etto/relay)
![NPM Downloads](https://img.shields.io/npm/dm/relay)

Uma biblioteca de Circuit Breaker **leve**, **zero-dependência** e **moderna** para Node.js, construída com foco em `async/await` e Typescript.

---

## 💡 Por que usar o reley?

Proteger suas aplicações contra falhas em serviços externos não deveria exigir a instalação de bibliotecas pesadas e complexas.

* **⚡ Leveza Extrema:** Zero dependências. O tamanho da biblioteca é minúsculo.
* **🔌 API Moderna:** Uma API limpa e intuitiva que usa `async/await` e `...rest parameters`, sem `null`s estranhos.
* **🛡️ Resiliência (Fail-Fast):** Impede que sua aplicação trave ao tentar chamar serviços que já estão offline, falhando rapidamente.
* **🎧 Observabilidade:** Emitie eventos para que você possa logar e monitorar a saúde dos seus circuitos (usando `EventEmitter`).
* **🎯 TypeScript Nativo:** Escrito inteiramente em **TypeScript** para uma excelente experiência de desenvolvimento.

## 📦 Instalação

```bash
npm install reley
```

## 🚀 Uso Rápido
```ts
import { Relay, RelayOpenError } from 'relay';

// 1. Crie uma instância
const relay = new Relay();

// 2. Defina sua função assíncrona
async function calcularFrete(cep) {
  // ... sua lógica de chamada fetch()
}

// 3. Execute sua função protegida
try {
  const frete = await relay.run(calcularFrete, '01001-000');
  console.log('Frete:', frete);

} catch (error) {
  // 4. Trate erros de circuito aberto
  if (error instanceof RelayOpenError) {
    console.warn('Serviço de frete indisponível, falha rápida.');
  } else {
    console.error('Falha na chamada:', error.message);
  }
}
```

## 📚 API e Padrões de Uso

1. `run(fn, ...args)`

## Este é o método principal. Ele recebe a função a ser executada e repassa todos os argumentos subsequentes para ela.

Com uma Função Simples
Você pode passar qualquer função que retorne uma **Promise**.

```ts
async function buscarUsuario(id) {
  // ... retorna Promise<Usuario>
}

// O segundo argumento (123) é passado como 'id' para buscarUsuario
const usuario = await relay.run(buscarUsuario, 123);
```

## Com um Método de Classe
Ao proteger um método de classe (que depende de **this**), use **.bind()** para garantir que o contexto (**this**) seja preservado.

```ts
class ApiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  
  async chamarApi(dados) {
    // ... usa this.apiKey para fazer a chamada
  }
}

const apiClient = new ApiClient('sk_123');

// Use .bind(apiClient) para "grudar" o contexto
const resultado = await relay.run(
  apiClient.chamarApi.bind(apiClient), 
  { valor: 100 } // argumento 'dados'
);
```
## 2. Configuração new Relay(options)
Você pode personalizar o comportamento do disjuntor no construtor.

```ts
const options = {
  // 3 falhas seguidas abrem o circuito (Default: 5)
  failureThreshold: 3, 
  
  // 10s de cooldown antes de tentar de novo (Default: 30000ms)
  coolDownPeriod: 10000, 
  
  // Timeout de 5s para a execução da função (Default: 10000ms)
  executionTimeout: 5000, 
};

const breaker = new Relay(options);
```

## 3. Observabilidade (Eventos)
O **Relay** herda de **EventEmitter**. Você pode ouvir eventos para logar e monitorar o estado do circuito.

```ts
import { RelayEvents } from 'relay';

breaker.on(RelayEvents.OPEN, (error) => {
  logger.error(' CIRCUITO ABERTO. As chamadas serão bloqueadas.', error);
});

breaker.on(RelayEvents.CLOSE, () => {
  logger.info(' CIRCUITO FECHADO. As chamadas voltaram ao normal.');
});

breaker.on(RelayEvents.HALF_OPEN, () => {
  logger.warn(' CIRCUITO MEIO-ABERTO. Testando a próxima chamada.');
});

breaker.on(RelayEvents.FAILURE, (error) => {
  logger.warn('Falha na chamada (Circuit Breaker)', error.message);
});
```
## 📜 Licença
Distribuído sob a [Licença MIT](LICENSE).
Copyright (c) 2025 João Neto - [DevEtto](https://github.com/Dev-Etto)
