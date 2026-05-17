# agno-microsoft-teams

Microsoft Teams / Bot Framework interface for Agno agents.

```python
from agno.agent import Agent
from agno_microsoft_teams import Teams
from fastapi import FastAPI

agent = Agent(name="Support")
app = FastAPI()

teams = Teams(
    agent=agent,
    app_id="00000000-0000-0000-0000-000000000000",
    app_password="bot-client-secret",
)

app.include_router(teams.get_router())
```

Set the Azure Bot messaging endpoint to:

```text
https://<runtime-host>/teams/<app-id>/messages
```

The interface validates inbound Bot Framework JWTs, strips Teams bot
mentions, downloads supported incoming attachments into Agno media, and
replies through the Bot Connector API. Slow agent runs emit Teams `typing`
activities before the final reply.

Structured Teams cards can be returned by exposing `adaptive_cards` or
`teams_cards` on the Agno response or on a structured `response.content` dict:

```python
response.adaptive_cards = [
    {
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": [{"type": "TextBlock", "text": "Card result"}],
    }
]
```

The interface sends those as Bot Framework Adaptive Card attachments. It does
not parse text into cards or handle card actions yet.
