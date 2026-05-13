# Teams channel

This folder contains the Teams app manifest assets and packaging helper. The
channel itself is configured from Payload Admin, not from local seed scripts.

## Runtime shape

Teams follows the same pattern as Telegram, WhatsApp, and Discord:

1. PayloadCMS stores the channel installation in `teams-bot-installations`.
2. The Agent Runtime reads active installations from Payload at boot.
3. The public Teams webhook points directly at the Agent Runtime:

```text
https://<public-bots-host>/teams/<azure-bot-app-id>/messages
```

PayloadCMS is the admin/config store. It is not the inbound webhook target for
Teams messages.

## Payload Admin setup

Create or update an Agent first:

- `name`
- `slug`
- `llmModel`
- `apiKey`
- `systemPrompt`

Then create a `Teams Bot Installation` under the `Chat` group:

- `agent`: the agent to expose in Teams
- `applicationName`: friendly Azure Bot name
- `appId`: Microsoft App ID / Entra client ID
- `appPassword`: bot client secret
- `appType`: usually `multitenant`
- `aadTenantId`: only for `singletenant`
- `status`: `active`

After changing a channel installation, restart the Agent Runtime in local dev.
In Kubernetes the runtime exits on channel reload and the pod is recreated.

## Local dev

Start the normal VS Code `Launch` compound in the devcontainer. Once the
runtime logs show the Teams route is mounted, expose the runtime manually:

```bash
cloudflared tunnel --url http://localhost:8000
```

Set the Azure Bot messaging endpoint to:

```text
https://<trycloudflare-host>/teams/<azure-bot-app-id>/messages
```

The expected runtime log line is:

```text
Mounted Teams interface prefix=/teams/<azure-bot-app-id>
```

## Package the Teams app

Generate a Teams app package from the template:

```bash
cd payload-agents/backend/agno-agent-builder/examples/teams-manifest
./package.sh <teams-app-id> <azure-bot-app-id> ./teams-agent.zip
```

- `teams-app-id`: a stable GUID for this Teams app package. Generate once and
  reuse for upgrades.
- `azure-bot-app-id`: the same Microsoft App ID stored in the Payload
  installation row.

The generated `manifest.json` and `.zip` are build artifacts and should not be
committed. Replace the icons and manifest metadata here if the consuming
product should not use the bundled Zetesis branding.

## Kubernetes

Expose Teams the same way the existing channel webhooks are exposed: route
`/teams/` to the `agent-runtime` service.

Example values:

```yaml
agentRuntime:
  channels:
    teams:
      enabled: true
      host: bots.example.com
```

Then configure Azure Bot with:

```text
https://bots.example.com/teams/<azure-bot-app-id>/messages
```
