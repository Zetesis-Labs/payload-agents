# Cast Patterns y Genericos en Paquetes Payload

> **Referencia**: [`typescript-monorepo-types.md`](./typescript-monorepo-types.md) — aislamiento de tipos en el monorepo
> **Derivado de**: Audit de tipos de los 6 paquetes del monorepo (2026-02-15)

---

## Por que necesitamos casts

Nuestros paquetes se compilan **aislados** del app-level `payload-types.ts` (ver `typescript-monorepo-types.md`). Esto significa que dentro de un paquete:

- `CollectionSlug` es `string` (no una union concreta como `'users' | 'posts'`)
- `DataFromCollectionSlug<T>` resuelve a un tipo generico, no a los campos reales de la coleccion
- `payload.find()`, `payload.findByID()`, etc. devuelven tipos genericos

Los casts son el **boundary** entre los tipos genericos del paquete aislado y los tipos concretos que sabemos que existen en runtime.

---

## Catalogo de cast patterns

### 1. Resultados de queries: `as unknown as InterfazLocal`

**Uso**: Castear resultados de `payload.find()`, `payload.findByID()`, etc. a una interfaz local que modela los campos que el paquete necesita.

```typescript
// Definir interfaz local con los campos que necesitamos
interface UserWithStripe {
  id: string | number
  stripeCustomerId?: string | null
}

// Cast despues de la query
const user = (await payload.findByID({
  collection: config.usersCollectionSlug,
  id: userId,
})) as unknown as UserWithStripe | null
```

**Reglas**:
- La interfaz local debe ser **minima** — solo los campos que la funcion usa
- Centralizar interfaces en `src/types/` si se usan en mas de un archivo
- Siempre `as unknown as` — nunca `as any`
- Incluir `| null` si el resultado puede ser nulo

**Por que `as unknown as` y no `as any`**:
- `as any` desactiva **todo** type-checking en el valor resultante. Errores como `user.nonExistentField` pasan silenciosos
- `as unknown as InterfazLocal` fuerza el tipo concreto. TypeScript valida todo acceso posterior contra la interfaz

---

### 2. Data en writes: `as Record<string, unknown>`

**Uso**: Argumento `data` en `payload.update()` y `payload.create()` cuando el paquete no conoce el schema exacto de la coleccion.

```typescript
await payload.update({
  collection: config.usersCollectionSlug,
  id: userId,
  data: { stripeCustomerId: null } as Record<string, unknown>,
})
```

**Variante para `payload.create()` donde el argumento completo necesita cast**:

```typescript
await payload.create(
  { collection: slug, data: planData } as unknown as Parameters<typeof payload.create>[0],
)
```

`as Parameters<Payload['update']>[0]` es mas expresivo que `as any` — comunica que estamos satisfaciendo la firma del metodo, no silenciando al compilador.

---

### 3. JSON boundaries: `JSON.parse() as Tipo`

**Uso**: Dentro de paquetes aislados, donde `JSON.parse()` devuelve `unknown` y no tenemos los tipos concretos de Payload.

```typescript
const event = JSON.parse(data) as SSEEvent
```

Esto es un cast de **boundary** — la data entra al programa sin tipo y le asignamos uno. No hay forma de evitarlo sin un runtime validator (zod, etc.), que seria sobreingenieria para datos internos.

**No aplica a**: `request.json()` en API routes de Next.js (app-level). Ahi los valores se usan inmediatamente y se validan en el propio handler — el cast no aporta seguridad real y es ruido innecesario.

---

### 4. CSS custom properties: `as React.CSSProperties`

**Uso**: Estilos inline con CSS variables custom que TypeScript no reconoce como claves validas de `CSSProperties`.

```typescript
const style = {
  '--thread-max-width': '680px',
  padding: '1rem',
} as React.CSSProperties
```

Patron estandar de React. No es un workaround — es una limitacion del tipado de CSS properties en TypeScript.

---

### 5. Const assertions: `as const`

**No es un cast**. `as const` es una const assertion que preserva el literal type.

```typescript
// Sin as const: tipo es string
const type = 'spring'

// Con as const: tipo es 'spring' (literal)
const type = 'spring' as const
```

Necesario cuando librerias como framer-motion o assistant-ui esperan literal types (`'spring'`) en vez de `string`. No requiere justificacion especial.

---

### 6. Error narrowing para SDKs sin tipos: helper centralizado

**Problema**: SDKs de terceros (Typesense, etc.) que no exportan tipos de error propios fuerzan casts inline repetidos.

**Anti-pattern** (cast repetido):
```typescript
// Repetido en 8 sitios
catch (error: unknown) {
  const typesenseError = error as { httpStatus?: number }
  if (typesenseError?.httpStatus === 404) {
    // ...
  }
}
```

**Patron correcto** (helper centralizado):
```typescript
// Definir una vez en adapter/types.ts
export interface TypesenseErrorLike {
  httpStatus?: number
}

export function isTypesense404(error: unknown): boolean {
  return (error as TypesenseErrorLike)?.httpStatus === 404
}

// Usar en todos los catch blocks
catch (error: unknown) {
  if (isTypesense404(error)) {
    // ...
  }
}
```

**Aplicable a cualquier SDK**: si un cast de error se repite 3+ veces, crear un helper.

---

### 7. Discriminated unions para eliminar cascadas de casts

**Problema**: Tipos con `data: unknown` o `data?: unknown` causan cascadas de casts en los consumidores.

**Anti-pattern**:
```typescript
interface SSEEvent {
  type: string
  data?: unknown
}

// Cada case necesita un cast
case 'token':
  callbacks.onToken?.(event.data as string)          // cast
case 'sources':
  callbacks.onSources?.(event.data as Source[])      // cast
case 'usage':
  callbacks.onUsage?.(event.data as UsageData)       // cast
```

**Patron correcto** (discriminated union):
```typescript
type SSEEvent =
  | { type: 'token'; data: string }
  | { type: 'sources'; data: Source[] }
  | { type: 'usage'; data: UsageData }
  | { type: 'done' }
  | { type: 'error'; data?: ErrorData }

// TypeScript infiere el tipo correcto por branch — 0 casts
case 'token':
  callbacks.onToken?.(event.data)      // TypeScript sabe que es string
case 'sources':
  callbacks.onSources?.(event.data)    // TypeScript sabe que es Source[]
```

**Cuando aplicar**: Si un `switch/case` o cadena de `if/else` sobre un campo `type` causa 3+ casts de `data`, convertir a discriminated union.

El unico cast que permanece es el de boundary: `JSON.parse(data) as SSEEvent`.

---

## Anti-patterns de genericos

### Anti-pattern 1: `<TConfig extends Config>`

**Donde aparecia**: `createIndexerPlugin`, `createTypesenseRAGPlugin`, `createBetterAuthStripePlugin`

```typescript
// ANTI-PATTERN — TConfig no aporta nada
export function createMyPlugin<TConfig extends Config>(
  config: PluginConfig
): (payloadConfig: TConfig) => TConfig
```

**Por que no aporta nada**: El array `plugins` de Payload espera `((config: Config) => Config)[]`. El generico `TConfig` no preserva informacion — el plugin solo muta arrays internos (`collections`, `endpoints`), no cambia la shape del config.

**Correcto**:
```typescript
export function createMyPlugin(
  config: PluginConfig
): (payloadConfig: Config) => Config
```

---

### Anti-pattern 2: `<TSlug extends CollectionSlug>`

**Donde aparecia**: 21 funciones en betterauth-stripe, ~16 en typesense

```typescript
// ANTI-PATTERN — en un paquete aislado, CollectionSlug es string
export async function getPlans<TPlans extends CollectionSlug>(
  payload: Payload,
  plansSlug: TPlans,
): Promise<PlanDoc[]>
```

**Por que no aporta nada**: Por el aislamiento de tipos, `CollectionSlug` es `string` dentro del paquete. `<TPlans extends CollectionSlug>` es identico a `<TPlans extends string>`. El generico:
- No afecta el return type (se castea con `as unknown as`)
- No afecta los callbacks
- No se usa para inferir campos de la coleccion (porque los campos son genericos)

**Correcto**:
```typescript
export async function getPlans(
  payload: Payload,
  plansSlug: CollectionSlug,
): Promise<PlanDoc[]>
```

**Referencia**: Los plugins oficiales de Payload (`plugin-stripe`, `plugin-multi-tenant`) usan `CollectionSlug` directo en funciones internas.

---

### Anti-pattern 3: Genericos arrastrados por configs

**Patron**: Una config con 4 genericos que se propagan a todas las funciones internas aunque cada funcion solo use 1-2.

```typescript
// ANTI-PATTERN — 4 genericos, pero handleProductUpdated solo usa TPlans
interface WebhookConfig<TPlans, TUsers, TSubs, TRoles> { ... }

async function handleProductUpdated<TPlans, TUsers, TSubs, TRoles>(
  event: Event,
  config: WebhookConfig<TPlans, TUsers, TSubs, TRoles>  // arrastra 3 genericos innecesarios
)
```

**Correcto**: Usar `CollectionSlug` directo en la config. Las funciones no necesitan genericos.

```typescript
interface WebhookConfig {
  plansSlug: CollectionSlug
  usersSlug: CollectionSlug
  subscriptionsSlug: CollectionSlug
  rolesSlug: CollectionSlug
}

async function handleProductUpdated(event: Event, config: WebhookConfig)
```

---

### Regla practica

> Si un generico no aparece en el **return type** ni en los **tipos de callback**, probablemente sobra.

Los genericos que SI aportan valor en nuestro monorepo:

| Generico | Paquete | Razon |
|----------|---------|-------|
| `TFieldMapping extends FieldMapping` | payload-indexer | `TypesenseFieldMapping` añade `type`, `facet`, `index`, `optional`. Narrowing real entre adapter y config |
| `TSchema extends BaseCollectionSchema` | payload-indexer | `TypesenseCollectionSchema` añade `defaultSortingField`. Adapter pattern necesita el generico |
| `TDoc = Record<string, unknown>` | payload-typesense | Permite al caller tipar documentos de busqueda. Narrowing util para el consumidor |

---

## Casts PROHIBIDOS

| Cast | Alternativa |
|------|-------------|
| `as any` | `as unknown as InterfazLocal` o `as Record<string, unknown>` |
| `as any[]` | `as unknown as InterfazLocal[]` |
| `(param as any).field` | Definir interfaz y castear: `(param as unknown as Interfaz).field` |
| `} as any` en data de update/create | `} as Record<string, unknown>` o `as Parameters<Payload['update']>[0]` |
| `eslint-disable @typescript-eslint/no-explicit-any` | Eliminar el `any` que lo causa |

**Excepcion unica**: `stubField as any` cuando la API de Payload exige un campo que no tiene sentido (e.g. `Column.field` para columnas custom). En este caso, aislar en un archivo de utilidades y documentar la razon.

---

## Resumen

| Situacion | Patron correcto |
|-----------|----------------|
| Resultado de `payload.find()` / `payload.findByID()` | `as unknown as InterfazLocal` |
| Data en `payload.update()` / `payload.create()` | `as Record<string, unknown>` |
| Argumento completo de `payload.create()` | `as unknown as Parameters<typeof payload.create>[0]` |
| `JSON.parse()` en paquetes aislados | `as TipoEsperado` (boundary cast) |
| `request.json()` en API routes | Sin cast — se valida inline |
| CSS custom properties | `as React.CSSProperties` |
| Literal types para librerias | `as const` (no es cast) |
| Error de SDK sin tipos | Helper centralizado (`isXxx404()`) |
| Data con campo discriminante (`type`) | Discriminated union |
| Slugs de coleccion en funciones | `CollectionSlug` directo — no generico |
| Config de plugin | `(config: Config) => Config` — no generico |
