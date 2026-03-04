# Type Audit Playbook

> **Referencia**: [`typescript-monorepo-types.md`](./typescript-monorepo-types.md) — arquitectura de tipos
> **Referencia**: [`payload-cast-patterns.md`](./payload-cast-patterns.md) — catalogo de patrones
> **Derivado de**: Audit sistematico de 6 paquetes del monorepo (2026-02-15)

---

## Objetivo

Metodologia reproducible para auditar la calidad de tipos de un paquete TypeScript en el monorepo. El audit identifica problemas, los clasifica por severidad, y produce un plan de refactoring priorizado.

---

## Proceso

```
1. Audit          → documento de analisis (sin tocar codigo)
2. Refactoring    → aplicar cambios (guiado por el audit)
3. Verificacion   → build + TSC + 0 errores
4. Documentacion  → documento de resultados
```

### Fase 1: Audit

**Input**: Paquete a auditar
**Output**: `docs/analysis/{paquete}-type-audit.md`

1. **Inventariar archivos**: Listar todos los `.ts`/`.tsx` con LOC, genericos, y casts por archivo
2. **Buscar metricas clave** (ver seccion "Que buscar")
3. **Clasificar cada hallazgo** por severidad y tipo
4. **Verificar contra patrones documentados** en `payload-cast-patterns.md`
5. **Comparar con otros paquetes** ya auditados (tabla comparativa)
6. **Producir plan de refactoring** priorizado por severidad

**Regla critica**: El audit es **solo lectura**. No se modifica codigo. El documento debe contener suficiente detalle (archivos, lineas, ejemplos de antes/despues) para que el refactoring sea mecanico.

### Fase 2: Refactoring

**Input**: Documento de audit aprobado
**Output**: Codigo modificado

1. Aplicar cambios ordenados por dependencia (tipos centrales primero, consumidores despues)
2. Cada hallazgo se implementa como unidad atomica
3. Los hallazgos marcados como "correcto" o "justificado" NO se tocan

### Fase 3: Verificacion

```bash
# 1. Build del paquete
pnpm --filter @zetesis/{paquete} build

# 2. Type-check global (detecta breaking changes en la app)
pnpm tsc --noEmit

# 3. Si hay tests
pnpm --filter @zetesis/{paquete} test
```

Los 3 deben pasar con **0 errores** antes de documentar resultados.

### Fase 4: Documentacion

**Input**: Cambios aplicados + verificacion OK
**Output**: `docs/analysis/{paquete}-type-refactor-results.md`

Incluir:
- Metricas antes/despues (tabla delta)
- Cambios por hallazgo (con ejemplos de antes/despues)
- Breaking changes y su impacto
- Archivos modificados
- Lecciones aprendidas

---

## Que buscar

### Metricas primarias

| Metrica | Herramienta | Objetivo |
|---------|-------------|----------|
| `as any` | `grep -r "as any"` | **0** en todo el paquete |
| `eslint-disable` | `grep -r "eslint-disable"` | **0** (eliminar la causa, no el sintoma) |
| `biome-ignore` | `grep -r "biome-ignore"` | Solo justificados (documentar razon) |
| Genericos `<T extends CollectionSlug>` | `grep -r "extends CollectionSlug"` | **0** en paquetes aislados |
| Genericos `<TConfig extends Config>` | `grep -r "extends Config"` | **0** en funciones de plugin |
| Interfaces duplicadas | Manual — comparar interfaces con nombres similares | **0** duplicaciones |

### Metricas secundarias

| Metrica | Que buscar |
|---------|-----------|
| Casts totales | `grep -r " as "` (filtrar `as const`) |
| Casts evitables | Casts que se eliminarian con mejor tipado (discriminated unions, genericos correctos) |
| Casts necesarios | `as unknown as InterfazLocal` (boundary), `JSON.parse() as`, `as React.CSSProperties` |
| Error casts repetidos | Mismo `as { field?: type }` en 3+ sitios |
| `as const` | No problematico — solo contar para completitud |

---

## Clasificacion de severidad

| Severidad | Criterio | Ejemplos |
|-----------|----------|----------|
| **Alta** | Pierde type-safety o causa sobreingenieria sistematica | `as any` (10 instancias), genericos innecesarios en 21 funciones |
| **Media** | Redundancia que causa riesgo de divergencia o complica mantenimiento | Interfaces duplicadas, configs duplicadas, funciones duplicadas |
| **Baja** | Redundancia menor o mejora estetica | Error casts repetidos (sin perdida de type-safety), simplificacion de assertion chains |
| **Correcto** | Patron documentado y necesario — NO modificar | `as unknown as InterfazLocal`, `as Record<string, unknown>`, `as const`, `JSON.parse() as` |
| **Justificado** | Workaround para limitacion de API externa — documentar razon | `stubField as any` (Payload Column API), `biome-ignore` con comentario |

---

## Checklist por paquete

### Casts y type-safety

- [ ] 0 instancias de `as any` / `as any[]`
- [ ] 0 directivas `eslint-disable @typescript-eslint/no-explicit-any`
- [ ] Todo `biome-ignore` tiene comentario justificativo
- [ ] Casts de query results usan `as unknown as InterfazLocal` (no `as any`)
- [ ] Casts de write data usan `as Record<string, unknown>` (no `as any`)
- [ ] No hay cascadas de casts que se resolverian con discriminated unions

### Genericos

- [ ] 0 genericos `<T extends CollectionSlug>` en funciones internas
- [ ] 0 genericos `<TConfig extends Config>` en funciones de plugin
- [ ] Genericos restantes aportan narrowing real (aparecen en return type o callbacks)
- [ ] No hay genericos "arrastrados" (declarados en 4 params, usados en 1)

### Organizacion

- [ ] 0 interfaces duplicadas entre archivos
- [ ] 0 funciones utilitarias duplicadas
- [ ] Interfaces compartidas centralizadas en `src/types/`
- [ ] Error casts repetidos (3+) centralizados en helper

### Verificacion

- [ ] `pnpm --filter @zetesis/{paquete} build` — 0 errores
- [ ] `pnpm tsc --noEmit` — 0 errores
- [ ] Tests pasan (si existen)

---

## Template: documento de audit

```markdown
# Type Audit: {nombre-paquete}

> **Fecha**: YYYY-MM-DD
> **Paquete**: `@zetesis/{paquete}`
> **Referencia**: [`payload-cast-patterns.md`](../architecture/payload-cast-patterns.md)

## Contexto
[Descripcion del paquete: que hace, de que depende, cuantos archivos TS]

## Estructura del paquete
[Arbol de archivos TS/TSX]

## Hallazgos
### 1. [Titulo] — [SEVERIDAD]
**Donde**: archivo:linea
**Problema**: [descripcion]
**Recomendacion**: [antes/despues]

## Resumen de severidad
[Tabla: #, hallazgo, severidad, tipo, archivos afectados]

## Metricas
[Tabla: as any, eslint-disable, biome-ignore, casts totales, genericos innecesarios, etc.]

## Plan de refactoring
[Fases ordenadas por dependencia]
```

---

## Template: documento de resultados

```markdown
# Resultados: Refactoring de tipos en {nombre-paquete}

> **Fecha**: YYYY-MM-DD
> **Documento previo**: [`{paquete}-type-audit.md`](./{paquete}-type-audit.md)

## Resumen ejecutivo
[Estado post-refactor: 0 as any, 0 eslint-disable, etc.]

## Metricas antes/despues
[Tabla con delta]

## Cambios realizados por hallazgo
### Hallazgo N: [titulo] — APLICADO/SIN CAMBIOS
[Antes/despues con codigo]

## Breaking changes
[Tabla: cambio, tipo, mitigacion]

## Archivos modificados
[Tabla: archivo, cambio]

## Lecciones aprendidas
[Insights del refactoring]
```

---

## Lecciones del monorepo (destiladas de 6 audits)

### Sobre genericos

1. **En paquetes aislados, `CollectionSlug` es `string`**. Todo generico `<T extends CollectionSlug>` es identico a `<T extends string>` — no aporta narrowing. Los plugins oficiales de Payload no usan genericos internamente.

2. **`<TConfig extends Config>` nunca aporta valor en plugins**. El sistema de plugins espera `(config: Config) => Config`. Los plugins solo mutan arrays internos.

3. **Los genericos se arrastran**. Un generico innecesario en una config se propaga a todas las funciones que reciben esa config. Una config con 4 genericos genera 4 genericos en cada funcion interna, aunque cada una solo use 1-2.

### Sobre casts

4. **`as any` se propaga silenciosamente**. Un `as any` en una interfaz de config (`isAdmin: (user: any)`) se filtra a todos los call sites sin warnings. `as unknown as InterfazLocal` fuerza el tipo concreto y TypeScript valida accesos posteriores.

5. **Los casts de boundary son inevitables**. `payload.find()` devuelve tipos genericos en paquetes aislados — el cast `as unknown as InterfazLocal` es el boundary entre tipos genericos y tipos concretos. No se puede eliminar sin runtime validation (zod), que seria sobreingenieria.

6. **Discriminated unions eliminan cascadas de casts**. Si un `switch/case` sobre un campo `type` causa 3+ casts de `data`, la solucion es tipar el tipo fuente como discriminated union, no añadir mas casts.

### Sobre proceso

7. **Separar audit de refactoring**. El documento de audit es un checkpoint de alineacion — permite validar los hallazgos antes de tocar codigo. Evita refactorings innecesarios o mal dirigidos.

8. **Los paquetes limpios desde el inicio requieren poco trabajo**. payload-indexer, payload-typesense, payload-lexical-blocks-builder, y payload-taxonomies tenian 0 `as any` y 0 `eslint-disable`. Solo tenian genericos innecesarios y redundancias menores. payload-betterauth-stripe (10 `as any`, 12 `eslint-disable`, 21 genericos innecesarios) fue el outlier.

9. **La eliminacion de genericos es mecanica**. El mismo patron se aplico en 3 paquetes sin sorpresas. Una vez identificado el anti-pattern, el refactoring es buscar-y-reemplazar guiado.

---

## Referencia rapida: orden de prioridad

Cuando se encuentra un paquete nuevo sin auditar:

1. **Primero**: Eliminar `as any` y `eslint-disable` (alta severidad, mayor impacto en type-safety)
2. **Segundo**: Eliminar genericos innecesarios (alta severidad, simplifica todo el paquete)
3. **Tercero**: Centralizar interfaces y funciones duplicadas (media severidad, reduce riesgo de divergencia)
4. **Cuarto**: Centralizar error casts repetidos (baja severidad, mejora legibilidad)
5. **Ultimo**: Optimizar casts con discriminated unions (baja severidad, mejora elegancia)
