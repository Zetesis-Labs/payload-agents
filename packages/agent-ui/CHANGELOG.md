# @zetesis/agent-ui

## 0.1.2

### Patch Changes

- [`8396a55`](https://github.com/Zetesis-Labs/PayloadAgents/commit/8396a55ec848dac034bb797b52d43ddef573c649) - fix(agent-ui): floating chat panel polish + extract chat-wrapper hooks

  Floating wrapper polish:

  - FAB now visible on every viewport so users always have a way to (re)open the chat after closing it (previously `lg:hidden` hid it on desktop, leaving the chat unreachable once closed).
  - Drops the brittle `isFirstMount` / `shouldAnimate` / `setTimeout(500)` dance that broke under React StrictMode dev double-mount and left the panel invisible (or briefly visible then gone).
  - Panel `motion.div` `initial` / `animate` / `exit` now share the same property keys so `opacity` actually animates 0 → 1 (the panel was rendering invisible because `animate` was missing the visibility props).
  - Header gets `relative z-10` so its `backdrop-blur` stacking context lifts the agent-selector dropdown above the chat thread (was clipped behind the AgentThread DOM).
  - First open auto-restores the user's most recent active session for the agent that `useChatAgents` already pre-selects.

  Hook extraction (internal, no public API change):

  - `useAutoloadRecentThread` — restores the most recent active conversation matching the selected agent on first open, with a `markAttempted` escape hatch for explicit "+ new chat" actions.
  - `useChatThread` — owns `loadedThread` + `threadKey`, composes the autoload hook, exposes `loadConversation` and `startNewThread`.
  - `usePanelState` — open / maximized / historyOpen state with named handlers (`openPanel`, `closePanel`, `toggleMaximized`, `toggleHistory`, `closeHistory`).
  - `useChatAgents` now returns `recentSessions` so consumers can derive without a duplicate SWR call.

## 0.1.1

### Patch Changes

- [#64](https://github.com/Zetesis-Labs/PayloadAgents/pull/64) [`adf5acd`](https://github.com/Zetesis-Labs/PayloadAgents/commit/adf5acd9cf110bf0339389c215be2075bbf69e5e) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: replace `@zetesis/chat-agent` with `@zetesis/agent-ui` (AG-UI based)

  The chat surface is now built on top of the AG-UI protocol with assistant-ui:

  - New package `@zetesis/agent-ui` exposes `AgentChatProvider`, `AgentThread`, `AgentThreadList` and helper components (`MarkdownText`, `Sources`, `ToolCalls`, `TokenUsageBar`, `LimitAlert`).
  - The runtime endpoint `POST /agents/{slug}/runs` is replaced by an AG-UI compliant `POST /agents/{slug}/agui` (multi-agent dispatcher around Agno's built-in `agno.os.interfaces.agui`). `agno-agent-builder` now depends on `ag-ui-protocol`.
  - `payload-agents-core`'s `/chat` endpoint accepts a vanilla `RunAgentInput` body (portal-specific routing rides inside `forwardedProps.agentSlug`) and passes AG-UI events through unchanged. `translateAgnoStream` is removed; `passthroughAguiStream` replaces it.
  - `selectedDocuments` is removed end-to-end (BFF schema, RAG search handler, RAG query builder, plugin types, dashboard read-only thread).
  - `payload-agents-metrics` swaps the legacy `Thread` runtime in its session side panel for a static read-only renderer using `MarkdownText`/`Sources`/`ToolCalls` from the new package.

  The legacy `@zetesis/chat-agent` package is deleted.
