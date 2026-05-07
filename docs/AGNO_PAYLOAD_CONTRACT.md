# Contrato Arquitectónico: Payload ↔ Agno ↔ UI

Este documento formaliza el contrato de datos y el flujo de comunicación implícito entre la base de datos de sesiones (gestionada por Payload CMS), el motor de agentes en Python (Agno), y el cliente web (`@zetesis/agent-ui` + `assistant-ui`).

Aunque el **streaming de mensajes** se rige estrictamente por el estándar **AG-UI Wire Format**, la orquestación, persistencia y métricas son específicos de la implementación de *Zetesis Payload Agents*.

---

## 1. El Esquema de Historial de Mensajes (`BackendMessage`)

Cuando el Frontend recarga una página y solicita el historial de una conversación pasada, Payload no envía eventos de *streaming* AG-UI, sino un JSON estructurado que representa la sesión.

El contrato exacto que Payload debe guardar y que `@zetesis/agent-ui` espera es el siguiente:

```typescript
export interface BackendMessage {
  /** El rol del emisor del mensaje. */
  role: 'user' | 'assistant' | 'system'
  
  /** El contenido en texto plano o Markdown. */
  content: string
  
  /** Timestamp de creación del mensaje (ISO string). */
  timestamp?: string
  
  /** 
   * [CUSTOM ZETESIS]: Fuentes o citas extraídas por el agente o las 
   * herramientas de recuperación (RAG). 
   */
  sources?: Array<{
    id: string
    title: string
    url?: string
    snippet?: string
  }>
  
  /**
   * [CUSTOM ZETESIS]: Lista de herramientas invocadas por el modelo durante 
   * la generación de este mensaje. AG-UI transmite estas invocaciones en vivo,
   * pero Payload las consolida en este array para su persistencia.
   */
  toolCalls?: Array<{
    id: string
    name: string
    input?: Record<string, unknown>
    result?: string
    // Las herramientas también pueden devolver fuentes inyectadas directamente.
    sources?: Array<{
      id: string
      title: string
      url?: string
    }>
  }>
}
```

> **Nota de Implementación:** 
> El módulo `message-adapters.ts` en `agent-ui` se encarga de convertir este `BackendMessage` al formato `ThreadMessageLike` que `assistant-ui` requiere para hidratar la UI de forma transparente.

---

## 2. Enrutamiento del Agente (`agentSlug`)

El protocolo nativo AG-UI no define un mecanismo estándar para especificar a **qué agente o modelo** quieres hablarle en arquitecturas multi-agente, asumiendo un único endpoint o un identificador estático.

### El Hack del Enrutamiento
Para que Payload sepa a qué agente en Python debe invocar, el cliente inyecta la propiedad `agentSlug` dentro del Payload (cuerpo de la petición HTTP) de la solicitud inicial de ejecución (`RunAgentInput`).

- En `AgentChatProvider.tsx`, hemos extendido la clase `HttpAgent` nativa (creando `PortalAgent`).
- `PortalAgent` intercepta la creación del flujo y empaqueta el `agentSlug` y los tokens de autorización en el envío.

**Flujo:**
1. UI invoca `useChat()`.
2. `PortalAgent` intercepta y hace un `POST /api/chat`. Body: `{ ..., agentSlug: "research-bot" }`.
3. Payload lee `agentSlug` y despacha el proceso a la cola correspondiente de Python o la API de Agno.

---

## 3. Telemetría y Métricas de Costes

El cálculo de costes de tokens, tiempos de ejecución e historial de uso ocurre enteramente en el lado del **Backend**.

### Flujo de Telemetría
1. **Python / Agno:** Al finalizar la generación, el agente de Python emite las estadísticas de la sesión (LLM tokens, tool usage tokens).
2. **Payload CMS:** Escucha el fin del proceso de Python. Guarda un registro de *uso* (Usage Record) vinculado a la cuenta del usuario/tenant, calculando el coste monetario basado en el modelo subyacente.
3. **Comunicación al Frontend:** Payload inyecta eventos personalizados en la corriente (stream) de Server-Sent Events (SSE) hacia el cliente:
   - Emite un evento `usage` que contiene `{ tokens, cost }`.
   - `AgentChatProvider.tsx` captura este evento y actualiza el contexto local `setUsage(snapshot)`. Esto propaga los cambios a la UI en vivo (por ejemplo, actualizando la "barra de presupuesto" o el Dashboard de Métricas).

### Evento `agno_run_completed`
De forma adicional, cuando la ejecución completa termina sin errores, el backend despacha el evento custom `agno_run_completed`. El cliente escucha esto para saber que es seguro recargar la lista de "Sesiones Recientes" en el Sidebar.

---

## Resumen de Responsabilidades

| Componente | Responsabilidad en este contrato |
| :--- | :--- |
| **@zetesis/agent-ui** | Traducir `BackendMessage` a UI. Interceptar `HttpAgent` para inyectar `agentSlug`. Manejar eventos custom de telemetría (`usage`). |
| **Payload CMS** | Persistir la sesión con el esquema `BackendMessage`. Enrutar peticiones a Python leyendo `agentSlug`. Calcular costes y emitir el evento `usage` por SSE. |
| **Agno (Python)** | Ejecutar el prompt. Formatear las citas de RAG dentro del esquema de `sources`. Responder siguiendo el estándar de AG-UI. |
