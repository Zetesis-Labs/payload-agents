# @zetesis/agent-ui

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
