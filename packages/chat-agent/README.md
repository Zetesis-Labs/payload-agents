# @zetesis/chat-agent

Floating chat agent component for React applications with AI integration. Built on [`@assistant-ui/react`](https://github.com/assistant-ui/assistant-ui).

## Installation

```bash
pnpm add @zetesis/chat-agent
```

## Usage

```tsx
import { FloatingChatManager, ChatProvider, NexoPayloadChatAdapter } from '@zetesis/chat-agent'
import '@zetesis/chat-agent/styles.css'

const adapter = new NexoPayloadChatAdapter({ baseUrl: '/api/chat' })

function App() {
  return (
    <ChatProvider adapter={adapter}>
      <FloatingChatManager />
    </ChatProvider>
  )
}
```

## Exports

### Main (`.`)

- **`FloatingChatManager`** - Floating chat widget component
- **`ChatProvider`** / **`useChat`** - React context for chat state
- **`useAssistantRuntime`** - Hook for assistant runtime adapter
- **`NexoPayloadChatAdapter`** - Payload CMS adapter with RAG support
- **`MockAdapter`** - Mock adapter for testing
- **`Thread`**, **`Composer`**, **`AssistantMessage`**, **`UserMessage`**, **`MarkdownText`** - Pre-built UI components

### Styles (`./styles.css`)

Tailwind CSS stylesheet. Import it in your app's entry point.

## Architecture

### Adapter Pattern

`NexoPayloadChatAdapter` connects to the RAG endpoints provided by `payload-typesense`. It handles message sending (`sendMessage`) and streaming response processing (`processStream`) via SSE.

`MockAdapter` provides a test double that simulates streaming responses without a backend.

### Key Hooks

| Hook | File | Role |
|------|------|------|
| `useDocumentSelector` | `src/components/useDocumentSelector.ts` | Document search with `buildSearchParams` and `logSearchResponse` helpers |
| `useAssistantRuntime` | `src/hooks/useAssistantRuntime.ts` | Connects the adapter to `@assistant-ui/react` runtime |
| `useChat` | `src/components/chat-context.tsx` | React context for chat state, agents, and collections |

### Component Hierarchy

```
ChatProvider (context + adapter)
  -> FloatingChatManager (floating widget)
    -> ChatInterface (main chat view)
      -> Thread (message list)
        -> AssistantMessage / UserMessage
          -> MarkdownText (rendered markdown)
      -> Composer (input area)
      -> DocumentSelector (document search for context)
```

## Features

- Adapter-based architecture for pluggable chat backends
- Payload CMS integration with RAG-enabled document search
- Pre-built UI components with markdown rendering and source citations
- Floating chat widget with chat history and session management
- Fully typed with TypeScript

## Peer Dependencies

- `react` ^19.0.0
- `react-dom` ^19.0.0

## License

MIT
