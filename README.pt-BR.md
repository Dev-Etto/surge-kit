<p align="center">
  <img src="./assets/surge-kit-banner1.png" alt="Surge Kit Banner" width="500">
</p>

Leia isto em outros idiomas: [English](./README.md)

# Surge Kit

![NPM Version](https://img.shields.io/npm/v/surge-kit)
![Build Status](https://img.shields.io/github/actions/workflow/status/Dev-Etto/surge-kit/main.yml?branch=main)
![Test Coverage](https://img.shields.io/codecov/c/github/Dev-Etto/surge-kit)
![NPM Downloads](https://img.shields.io/npm/dm/surge-kit)

Uma biblioteca de Circuit Breaker **leve**, **zero-dependência** e **moderna** para Node.js, construída com foco em `async/await` e TypeScript. Proteja seus serviços com uma API programática limpa, **decorators TypeScript** elegantes (`@UseRelay`, `@Fallback`), ou registro flexível de fallbacks—escolha a abordagem que se encaixa na sua arquitetura.

---

## 💡 Por que usar o surge-kit?

Proteger suas aplicações contra falhas em serviços externos não deveria exigir a instalação de bibliotecas pesadas e complexas.

* **⚡ Leveza Extrema:** Zero dependências. O tamanho da biblioteca é minúsculo.
* **🔌 API Moderna:** Uma API limpa e intuitiva que usa `async/await` e `...rest parameters`.
* **✨ Decorators TypeScript:** Use os decorators `@UseRelay` e `@Fallback` para proteção declarativa e limpa com circuit breaker.
* **🛡️ Resiliência (Fail-Fast):** Impede que sua aplicação trave ao tentar chamar serviços que já estão offline, falhando rapidamente.
* **🎧 Observabilidade:** Emite eventos para que você possa logar e monitorar a saúde dos seus circuitos (usando `EventEmitter`).
* **🎯 TypeScript Nativo:** Escrito inteiramente em **TypeScript** para uma excelente experiência de desenvolvimento.

## 📦 Instalação

```bash
npm install surge-kit
```

## 🚀 Início Rápido

### Uso Básico
```ts
import { Relay, RelayOpenError } from 'surge-kit';

// 1. Crie uma instância
const relay = new Relay();

// 2. Defina sua função assíncrona
async function calcularFrete(cep) {
  // ...sua lógica de fetch()
}

// 3. Execute sua função protegida
try {
  const valorFrete = await relay.run(calcularFrete, '01001-000');
  console.log('Frete:', valorFrete);

} catch (error) {
  // 4. Trate erros de circuito aberto
  if (error instanceof RelayOpenError) {
    console.warn('Serviço de frete indisponível, falhando rapidamente.');
  } else {
    console.error('Chamada falhou:', error.message);
  }
}
```

### Usando Instância Padrão (Recomendado para Apps com Único Relay)
```ts
import { Relay, UseRelay } from 'surge-kit';

// 1. Crie e defina como padrão
const relay = new Relay();
Relay.setDefault(relay);

// 2. Use decorators sem passar a instância
class ServicoFrete {
  @UseRelay() // Nenhum argumento necessário!
  async calcularFrete(cep: string) {
    // ...sua lógica de fetch()
  }
}
```

## ✨ Usando Decorators

Agora você pode usar decorators do TypeScript para proteger seus métodos de forma limpa.

**Pré-requisito:** Habilite `experimentalDecorators: true` no seu `tsconfig.json`.

### `@UseRelay(relayInstance?)`

Envolve um método ou todos os métodos de uma classe com `relay.run()`. O parâmetro de instância do relay é **opcional** - se não fornecido, usa `Relay.getDefault()`.

**Decoração de Método:**
```ts
import { Relay, UseRelay } from 'surge-kit';

const myRelay = new Relay();

class ApiService {
  @UseRelay(myRelay)
  async buscarDados(id: number) {
    // Este método é protegido automaticamente
    return await fetch(`/api/dados/${id}`);
  }
}
```

**Decoração de Classe:**
```ts
import { Relay, UseRelay } from 'surge-kit';

const myRelay = new Relay();

@UseRelay(myRelay)
class ApiService {
  async buscarUsuarios() {
    // Automaticamente protegido
  }

  async buscarPosts() {
    // Automaticamente protegido
  }
}
```

**Usando Instância Padrão:**
```ts
import { Relay, UseRelay } from 'surge-kit';

// Configure uma vez na inicialização do app
const myRelay = new Relay();
Relay.setDefault(myRelay);

// Agora você pode usar @UseRelay sem argumentos!
@UseRelay()
class ApiService {
  async buscarDados() {
    // Protegido com relay padrão
  }
}

// Também funciona em métodos individuais
class ServicoUsuario {
  @UseRelay()
  async obterUsuario(id: number) {
    // Protegido com relay padrão
  }
}
```

### `@Fallback(nomeMetodo | funcao)`

Define um fallback a ser executado se o método falhar (ou se o circuito estiver aberto).
- **String:** Nome de um método na mesma classe.
- **Função:** Uma função independente.

```ts
class ApiService {
  @Fallback('dadosFallback') // Deve estar ACIMA de @UseRelay para capturar erros corretamente
  @UseRelay(myRelay)
  async operacaoArriscada(id: number) {
    throw new Error('Boom!');
  }

  async dadosFallback(error: Error, id: number) {
    return { id, status: 'fallback', erro: error.message };
  }
}
```

> [!IMPORTANT]
> **A Ordem dos Decorators Importa!** Sempre coloque `@Fallback` **acima** de `@UseRelay`. Decorators executam de baixo para cima, então `@Fallback` (externo) deve envolver `@UseRelay` (interno) para capturar erros adequadamente, incluindo `RelayOpenError`.

### `@RelayClass(relayInstance)`

**Nota:** `@RelayClass` agora é substituído pelo `@UseRelay` em nível de classe, mas permanece disponível para compatibilidade retroativa.

Protege **todos os métodos** de uma classe com o circuit breaker.

```ts
import { Relay, RelayClass } from 'surge-kit';

const myRelay = new Relay();

@RelayClass(myRelay)
class ApiService {
  async buscarUsuarios() {
    // Automaticamente protegido
  }

  async buscarPosts() {
    // Automaticamente protegido
  }
}
```

### `@FallbackClass(ClasseFallback)`
Define uma classe de fallback. Se os métodos falharem, os métodos correspondentes da classe de fallback são chamados.

```ts
import { RelayClass, FallbackClass } from 'surge-kit';

class ApiFallback {
  async getData(error: Error) {
    return 'Dados em cache';
  }
}

@RelayClass(myRelay)
@FallbackClass(ApiFallback)
class ApiPrimaria {
  async getData() {
    throw new Error('Serviço fora do ar');
  }
}

const api = new ApiPrimaria();
await api.getData(); // Retorna 'Dados em cache'
```

## 🔄 Fallback sem Decorators (`relay.register`)

Se você não pode usar decorators, pode registrar uma implementação de fallback para seus métodos.

```ts
const relay = new Relay();

const primario = {
  async getData() { throw new Error('Falha'); }
};

const fallback = {
  async getData() { return 'Dados em Cache'; }
};

// Registra fallback.getData como o fallback para primario.getData
relay.register(primario, fallback);

// Quando você executa primario.getData, ele usará o fallback em caso de falha
const resultado = await relay.run(primario.getData); // Retorna 'Dados em Cache'
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
### 2. Configuração `new Relay(options)`
Você pode personalizar o comportamento do disjuntor passando um objeto de opções para o construtor.

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `failureThreshold` | `number` | `5` | O número de falhas consecutivas para abrir o circuito. |
| `coolDownPeriod` | `number` | `30000` | O tempo em milissegundos que o circuito fica `OPEN` antes de ir para `HALF_OPEN`. |
| `executionTimeout` | `number` | `10000` | O tempo máximo em milissegundos que a função pode executar antes de ser considerada uma falha. |
| `useExponentialBackoff` | `boolean` | `false` | Se `true`, o `coolDownPeriod` aumentará exponencialmente após cada falha consecutiva. |
| `maxCooldown` | `number` | `600000` | O `coolDownPeriod` máximo em milissegundos ao usar o backoff exponencial. |
| `onFallback` | `(err: Error) => Promise<TFallback>` | `null` | Uma função de contingência (fallback) para executar quando o circuito está `OPEN` ou uma chamada falha. |


**Exemplo com Backoff Exponencial:**

Para evitar sobrecarregar um serviço instável, você pode habilitar o backoff exponencial. O tempo de `coolDownPeriod` aumentará a cada falha consecutiva, dando mais tempo para o serviço se recuperar.

```ts
const options = {
  failureThreshold: 3,
  coolDownPeriod: 5000,        // Cooldown inicial: 5s
  useExponentialBackoff: true,
  maxCooldown: 60000           // Cooldown máximo: 60s
};

const relay = new Relay(options);

// Com esta configuração:
// - 1ª abertura do circuito: cooldown de 5s.
// - 2ª abertura consecutiva: cooldown de 10s.
// - 3ª abertura consecutiva: cooldown de 20s (e assim por diante, até 60s).
```
**Exemplo com `onFallback`:**

Se uma função `onFallback` for fornecida, o `relay.run()` irá executá-la em vez de lançar um erro. Isso permite que você sirva dados de um cache ou uma resposta padrão.

```ts
// (Exemplo: Uma função para buscar dados do cache)
async function buscarFreteDoCache() {
  return { preco: 10.00, fonte: 'cache' };
};

const options = {
  failureThreshold: 2,
  coolDownPeriod: 10000,     // 10 segundos
  executionTimeout: 5000,  // 5 segundos
  onFallback: (error) => {
    // Loga o erro
    logger.warn(`Fallback do Relay ativado: ${error.message}`);
    // Retorna os dados do cache
    return buscarFreteDoCache();
  }
};

const relay = new Relay(options);

// Agora, se calcularFrete falhar 2 vezes,
// chamadas subsequentes irão automaticamente rodar buscarFreteDoCache()
// em vez de lançar um RelayOpenError.
const frete = await relay.run(calcularFrete, '01001-000');
console.log('Frete:', frete); // { preco: 10.00, fonte: 'cache' }
```

### 3. API de Instância Padrão

Para aplicações que usam uma única instância de Relay, você pode defini-la como padrão para simplificar o uso de decorators.

#### `Relay.setDefault(instance: Relay)`
Define a instância global padrão do Relay.

```typescript
const relay = new Relay({ failureThreshold: 3 });
Relay.setDefault(relay);
```

#### `Relay.getDefault(): Relay`
Obtém a instância global padrão do Relay. Lança um erro se nenhuma padrão foi definida.

```typescript
const relay = Relay.getDefault();
```

#### `Relay.clearDefault(): void`
Limpa a instância global padrão do Relay. **Essencial para limpeza de testes.**

```typescript
Relay.clearDefault();
```

#### `relay.cleanup(): void`
Limpa quaisquer timers de cooldown pendentes. **Essencial para prevenir vazamento de recursos em testes.**

Quando um circuito Relay abre, ele agenda um timer para transitar para o estado `HALF_OPEN` após o período de cooldown. Se seus testes criam instâncias de Relay que abrem circuitos, esses timers podem persistir e causar problemas como:
- Avisos do Jest sobre timers não limpos
- Vazamento de memória em suítes de teste
- Comportamento imprevisível dos testes

```typescript
const relay = new Relay();
// ... use relay nos testes ...
relay.cleanup(); // Limpa quaisquer timers pendentes
```

> [!WARNING]
> **Testando com Instância Padrão**: A instância padrão é um estado global. Sempre chame `Relay.clearDefault()` na limpeza dos seus testes (ex: `afterEach`) para prevenir poluição entre testes.

**Exemplo de Configuração de Teste:**
```typescript
describe('Meu Serviço', () => {
  let relay: Relay;

  beforeEach(() => {
    relay = new Relay({ failureThreshold: 2 });
    Relay.setDefault(relay);
  });

  afterEach(() => {
    relay.cleanup();        // Limpa quaisquer timers pendentes
    Relay.clearDefault();   // Limpa a instância padrão
  });

  it('deve funcionar', async () => {
    // Seus testes aqui
  });
});
```

## 4. Observabilidade (Eventos)
O **Relay** herda de **EventEmitter**. Você pode ouvir eventos para logar e monitorar o estado do circuito.

```ts
import { RelayEvents } from 'surge-kit';

relay.on(RelayEvents.OPEN, (error) => {
  logger.error(' CIRCUITO ABERTO. As chamadas serão bloqueadas.', error);
});

relay.on(RelayEvents.CLOSE, () => {
  logger.info(' CIRCUITO FECHADO. As chamadas voltaram ao normal.');
});

relay.on(RelayEvents.HALF_OPEN, () => {
  logger.warn(' CIRCUITO MEIO-ABERTO. Testando a próxima chamada.');
});

relay.on(RelayEvents.FAILURE, (error) => {
  logger.warn('Falha na chamada (Relay)', error.message);
});
```
## 4. Métricas e Saúde

O `surge-kit` rastreia métricas internas de sucessos, falhas e timeouts, permitindo que você monitore a saúde do seu circuit breaker. Você pode obter essas métricas usando o método `getMetrics()`.

```typescript
const relay = new Relay();

// Após algumas chamadas...
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

O método `getMetrics()` retorna um objeto com a seguinte estrutura:

-   `state`: O estado atual do relay (`CLOSED`, `OPEN`, ou `HALF-OPEN`).
-   `successes`: O número total de chamadas bem-sucedidas.
-   `failures`: O número total de chamadas que falharam (incluindo timeouts).
-   `timeouts`: O número total de chamadas que excederam o tempo limite.
-   `total`: A soma de `successes` e `failures`.

Isso é particularmente útil para expor a saúde dos seus serviços através de um endpoint de métricas, por exemplo, com Express:

```typescript
server.get('/metrics/meu-servico', (req, res) => {
  res.json(relay.getMetrics());
});
```
## 📜 Licença
Distribuído sob a [Licença MIT](LICENSE).

Copyright (c) 2025 João Neto - [DevEtto](https://github.com/Dev-Etto).
