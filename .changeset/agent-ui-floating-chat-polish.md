---
'@zetesis/agent-ui': patch
---

fix(agent-ui): floating chat panel polish + extract chat-wrapper hooks

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
