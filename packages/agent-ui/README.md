# @zetesis/agent-ui

Drop-in chat surface for Payload-backed agents, built on top of
[assistant-ui](https://www.assistant-ui.com/) and the
[AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui).

The package speaks AG-UI end-to-end: events from the agent runtime are
streamed unchanged to the React client. Two `CUSTOM` events are reserved
for portal-specific concerns:

- `usage` — daily token budget snapshot, emitted by the BFF before and
  after each run so the UI can render the budget bar.

Tool-call results and RAG sources travel inside the standard AG-UI
`TOOL_CALL_*` events; the package extracts and renders them.

## Install

```sh
pnpm add @zetesis/agent-ui @assistant-ui/react react react-dom
```

Import the stylesheet once at the app root:

```ts
import '@zetesis/agent-ui/styles.css'
```

## Usage

```tsx
import { AgentChatProvider, AgentThread, AgentThreadList } from '@zetesis/agent-ui'

export function ChatPage() {
  return (
    <AgentChatProvider endpoint="/api/chat" agentSlug="support">
      <div className="flex h-screen">
        <aside className="w-72 border-r"><AgentThreadList /></aside>
        <main className="flex-1"><AgentThread welcomeTitle="Hola" /></main>
      </div>
    </AgentChatProvider>
  )
}
```

The provider expects a same-origin endpoint that forwards AG-UI events
from the agent runtime. The Payload plugin `@zetesis/payload-agents-core`
ships a default handler that does this.
