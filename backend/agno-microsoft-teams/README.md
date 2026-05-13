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
replies through the Bot Connector API.
