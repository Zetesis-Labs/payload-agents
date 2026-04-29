---
'@zetesis/chat-agent': patch
---

Fix hydration error caused by nested `<button>` in the chat history list. Each session row was rendered as a `<button>` with rename/delete/options child buttons inside; the resulting markup is invalid HTML and React aborts hydration. Replaced the outer element with a `<div role="button" tabIndex={0}>` and added an Enter/Space `onKeyDown` handler so keyboard activation still works.
