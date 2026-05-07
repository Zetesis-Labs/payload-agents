# @zetesis/agent-ui-element

Web Component wrapper around [`@zetesis/agent-ui`](../agent-ui). Drop a
single `<script>` into any HTML page and embed an AG-UI chat with one
custom element.

## Usage

```html
<script src="https://cdn.jsdelivr.net/npm/@zetesis/agent-ui-element"></script>

<zetesis-agent-chat
  endpoint="https://api.example.com/chat"
  agent-slug="support"
  auth-token="eyJhbGci..."
></zetesis-agent-chat>
```

## Attributes

| Attribute | Required | Description |
|---|---|---|
| `endpoint` | yes | AG-UI compatible endpoint (typically a BFF). |
| `agent-slug` | yes | Agent slug to chat with. |
| `agent-name` | no | Display name shown in the header. |
| `auth-token` | no | Forwarded as `Authorization: Bearer <token>`. |
| `welcome-title` | no | Empty-state title. |
| `welcome-subtitle` | no | Empty-state subtitle. |

The component renders into an open shadow root with Tailwind v4 inlined,
so the host page's CSS doesn't bleed in either direction. Override design
tokens (`--background`, `--primary`, …) on the element for theming.

## Develop

```sh
pnpm --filter @zetesis/agent-ui-element dev    # vite dev server
pnpm --filter @zetesis/agent-ui-element build  # IIFE + ESM bundles in dist/
```

## License

MIT.
