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
* **🧰 Kit de Resiliência:** Decorators `@Retry`, `@Bulkhead`, `@RateLimit` e `@Cache` que se combinam com o circuit breaker em qualquer ordem.
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
import { Relay, RelayOpenError, RelayTimeoutError } from 'surge-kit';

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
  } else if (error instanceof RelayTimeoutError) {
    console.warn(`Serviço de frete demorou mais de ${error.timeout}ms.`);
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

> [!NOTE]
> A decoração de classe só envolve métodos declarados com `async`, então helpers síncronos mantêm seu comportamento. Um método que retorna uma Promise sem `async` não é envolvido; nesse caso, use `@UseRelay` direto nele. Se a classe não tiver nenhum método `async` (por exemplo, código compilado para um target abaixo de ES2017), um aviso de processo `SURGE_KIT_NO_ASYNC_METHODS` é emitido em vez de falhar em silêncio.

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

> [!NOTE]
> **A ordem dos decorators não importa.** Todos os decorators do surge-kit entram num pipeline de ordem fixa, então o método se comporta igual em qualquer ordem de escrita. Veja [Combinando decorators](#-combinando-decorators). Escrever na ordem do pipeline (`@Fallback` no topo) continua sendo o mais legível.

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

## 🧰 Decorators de Resiliência

Além do circuit breaker, o surge-kit traz decorators para os outros padrões comuns de resiliência. Eles funcionam sozinhos ou junto com `@UseRelay` e `@Fallback`. Métodos com `@Retry`, `@Bulkhead` ou `@RateLimit` sempre retornam uma Promise, enquanto o `@Cache` mantém métodos síncronos síncronos. Opções inválidas lançam um `TypeError` quando a classe é definida.

### `@Retry(options)`

Tenta de novo uma chamada que falhou antes de propagar o erro, para falhas passageiras como uma instabilidade momentânea de rede.

```ts
import { Retry, UseRelay } from 'surge-kit';

class ApiService {
  // Até 3 tentativas, esperando 100ms e depois 200ms entre elas.
  // O relay só conta uma falha se as 3 tentativas falharem.
  @Retry({ attempts: 3, delay: 100, backoff: 2 })
  @UseRelay()
  async buscarDados() {
    // ... chamada de rede
  }
}
```

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `attempts` | `number` | — | Número máximo de tentativas, incluindo a primeira chamada. |
| `delay` | `number` | `0` | Milissegundos de espera antes da primeira nova tentativa. |
| `backoff` | `number` | `1` | Multiplicador aplicado à espera a cada nova tentativa (`2` dobra). |
| `maxDelay` | `number` | `Infinity` | Limite máximo da espera entre tentativas. |
| `retryIf` | `(error, attempt) => boolean` | `() => true` | Retorne `false` para erros que não devem ser repetidos (ex.: erros de validação). |

> [!NOTE]
> As novas tentativas rodam sempre **dentro** do `@UseRelay`, então nada é repetido enquanto o circuito está `OPEN`. O `executionTimeout` do relay cobre toda a sequência de tentativas, incluindo as esperas, então dimensione-o de acordo. Depois que ele expira, nenhuma nova tentativa é iniciada.

### `@Bulkhead(options)`

Limita quantas chamadas de um método rodam ao mesmo tempo, para que uma dependência lenta não esgote os recursos da sua aplicação. Chamadas acima do limite falham na hora com `BulkheadRejectedError`, sem executar o método.

```ts
import { Bulkhead } from 'surge-kit';

class ServicoPagamento {
  // No máximo 10 pagamentos em andamento; até 5 esperam uma vaga.
  @Bulkhead({ maxConcurrent: 10, maxQueue: 5 })
  async processarPagamento() {
    // ...
  }
}
```

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `maxConcurrent` | `number` | — | Número máximo de chamadas rodando ao mesmo tempo. |
| `maxQueue` | `number` | `0` | Chamadas que podem esperar uma vaga (FIFO). `0` rejeita assim que o limite é atingido. |

Uma vaga é liberada quando a chamada retorna para quem a fez, inclusive quando o `@UseRelay` a encerra por timeout. A operação que estourou o tempo não pode ser cancelada e pode continuar rodando, mas segurar a vaga travaria o método para sempre se ela nunca terminasse.

### `@RateLimit(options)`

Aplica um limite de taxa no cliente, para respeitar as cotas de APIs externas. Usa janela deslizante: no máximo `limit` chamadas começam em qualquer intervalo de `windowMs`. Chamadas acima do limite falham com `RateLimitExceededError`, que expõe `retryAfterMs`, sem executar o método.

```ts
import { RateLimit } from 'surge-kit';

class ServicoApiExterna {
  // No máximo 50 chamadas por minuto.
  @RateLimit({ limit: 50, windowMs: 60000 })
  async buscarDadosTerceiros() {
    // ...
  }
}
```

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `limit` | `number` | — | Número máximo de chamadas dentro da janela. |
| `windowMs` | `number` | — | Tamanho da janela em milissegundos. |

Chamadas rejeitadas não consomem o limite, e uma chamada repetida pelo `@Retry` conta uma vez só.

> [!NOTE]
> Os limites do `@Bulkhead` e do `@RateLimit` são compartilhados por **todas as instâncias** da classe, porque protegem o recurso externo, não um objeto.

### `@Cache(options)`

Guarda os resultados em memória por `ttl` milissegundos, usando os argumentos como chave. A chamada mais resiliente é a que você não precisa fazer.

```ts
import { Cache, UseRelay } from 'surge-kit';

class ServicoProduto {
  // Chamadas com o mesmo id em até 5 segundos retornam o resultado em cache.
  @Cache({ ttl: 5000 })
  @UseRelay()
  async obterDetalhesProduto(id: string) {
    // ...
  }
}
```

| Opção | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `ttl` | `number` | — | Milissegundos que um resultado fica em cache (no máximo `2147483647`, cerca de 24,8 dias). |
| `key` | `(...args) => string` | `defaultCacheKey` | Monta a chave do cache a partir dos argumentos. Lance um erro para pular o cache numa chamada. |
| `maxSize` | `number` | `Infinity` | Máximo de entradas por instância; a usada há mais tempo é removida. |

- Só resultados de sucesso entram no cache. Erros e resultados do `@Fallback` nunca entram.
- Chamadas simultâneas com a mesma chave compartilham a mesma Promise pendente.
- Um acerto no cache pula todas as outras camadas, então dados em cache continuam sendo servidos com o circuito `OPEN`.
- Cada instância tem o próprio cache, e entradas expiradas são removidas automaticamente.
- A chave padrão (`defaultCacheKey`, exportada) é uma codificação JSON dos argumentos que diferencia `undefined`, `null`, `NaN`, `Infinity`, `-0` e bigints. Argumentos que ela não consegue codificar sem perder informação, como `Map`, `Set`, funções, symbols, objetos circulares e instâncias de classe sem propriedades próprias, fazem a chamada passar sem cache. Passe uma `key` para cachear esses casos.

É um cache pequeno de resiliência, não um substituto para um armazenamento compartilhado como o Redis.

### 🧩 Combinando decorators

Os decorators podem ser empilhados em qualquer ordem. O surge-kit sempre os aplica nesta ordem, de fora para dentro:

```
@Fallback → @Cache → @Bulkhead → @RateLimit → @UseRelay → @Retry → método
```

- **`@Fallback`** fica por fora de tudo. Trata qualquer erro, inclusive `RelayOpenError`, `BulkheadRejectedError` e `RateLimitExceededError`, e seus resultados nunca entram no cache.
- Um acerto no **`@Cache`** pula tudo abaixo dele.
- **`@Bulkhead`** e **`@RateLimit`** rejeitam antes do relay, então suas rejeições não abrem o circuito.
- **`@Retry`** roda dentro do relay, então o relay só conta uma chamada em que todas as tentativas falharam.

```ts
class ServicoCatalogo {
  @Fallback('catalogoEmCache')
  @Cache({ ttl: 5000 })
  @Bulkhead({ maxConcurrent: 20 })
  @RateLimit({ limit: 100, windowMs: 60000 })
  @UseRelay()
  @Retry({ attempts: 3, delay: 100, backoff: 2 })
  async obterCatalogo(categoria: string) {
    // ...
  }

  async catalogoEmCache(error: Error, categoria: string) {
    // ...
  }
}
```

## 🔄 Fallback sem Decorators (`relay.register`)

Se você não pode usar decorators, pode registrar uma implementação de fallback para seus métodos. O `register` só vale para funções passadas direto para `relay.run`. Para métodos protegidos com `@UseRelay`, use `@Fallback` ou `@FallbackClass`.

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

O `register` substitui cada método registrado no objeto primário por uma cópia ligada a ele, então passe `primario.getData` diretamente. Não use `.bind()`, porque ele cria uma nova função que não tem fallback registrado. Os métodos de fallback também são chamados com o próprio objeto como `this`.

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
| `coolDownPeriod` | `number` | `30000` | O tempo em milissegundos que o circuito fica `OPEN` antes de ir para `HALF_OPEN`. Em `HALF_OPEN` só uma chamada de teste passa, e as chamadas simultâneas são rejeitadas com `RelayOpenError` até ela terminar. Só o resultado da chamada de teste fecha ou reabre o circuito. |
| `executionTimeout` | `number` | `10000` | O tempo máximo em milissegundos que a função pode executar antes de ser considerada uma falha. Chamadas que excedem o tempo são rejeitadas com `RelayTimeoutError`. |
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
