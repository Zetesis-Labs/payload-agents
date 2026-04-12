# Quality Roadmap: agent-runtime

Informe comparativo contra el backend de Nixon (`/IronTec/nixon/backend/`) con cambios concretos para elevar la calidad del servicio agent-runtime.

**Referencia**: Nixon es un monorepo Python con DDD, structlog, CI/CD completo, testing exhaustivo y tooling maduro. agent-runtime es un servicio de ~500 LOC que funciona bien pero tiene gaps significativos en calidad de codigo, observabilidad y devtools.

**Criterio**: Cada recomendacion es proporcional al tamano del servicio. No se propone DDD ni capas de abstraccion innecesarias para ~500 LOC.

---

## Resumen ejecutivo

| # | Area | Prioridad | Esfuerzo | Impacto |
|---|------|-----------|----------|---------|
| 1 | [Structured logging (structlog)](#1-structured-logging-structlog) | P0 | Medio | Alto |
| 2 | [Jerarquia de excepciones](#2-jerarquia-de-excepciones) | P0 | Bajo | Alto |
| 3 | [Ruff: reglas de seguridad y builtins](#3-ruff-reglas-de-seguridad-y-builtins) | P1 | Bajo | Medio |
| 4 | [Testing: cobertura critica](#4-testing-cobertura-critica) | P1 | Medio | Alto |
| 5 | [Separacion de responsabilidades en registry.py](#5-separacion-de-responsabilidades-en-registrypy) | P1 | Medio | Alto |
| 6 | [CI pipeline para Python](#6-ci-pipeline-para-python) | P2 | Medio | Alto |
| 7 | [Type checking: pyright + stubs](#7-type-checking-pyright--stubs) | P2 | Bajo | Medio |
| 8 | [Observabilidad: correlation IDs](#8-observabilidad-correlation-ids) | P2 | Bajo | Medio |
| 9 | [Scripts de desarrollo](#9-scripts-de-desarrollo) | P3 | Bajo | Bajo |
| 10 | [Config: eliminar type: ignore](#10-config-eliminar-type-ignore) | P3 | Bajo | Bajo |

---

## P0 — Critico

### 1. Structured logging (structlog)

**Problema**: agent-runtime usa `logging.getLogger` con un `_JSONFormatter` custom de 15 lineas en `main.py`. No hay context binding, no hay loggers con estado, y el formato JSON es fragil (custom, sin tests). Si algo falla en produccion, cada linea de log es independiente — imposible correlacionar peticiones.

**Nixon usa**: `structlog` con procesadores configurables (JSON para prod, ConsoleRenderer con colores para dev), `BoundLogger` para context binding, y `LogContext` como context manager.

**Referencia Nixon**: `packages/nixon-server-core/src/nixon_server_core/core/logging.py`

#### Ficheros afectados

- `agent_runtime/main.py` — eliminar `_JSONFormatter`, reemplazar setup de logging
- `agent_runtime/registry.py` — reemplazar `logging.getLogger` por `structlog`
- `agent_runtime/health.py` — idem
- `pyproject.toml` — anadir dependencia `structlog`
- **Nuevo**: `agent_runtime/logging.py`

#### Antes (`main.py:38-59`)

```python
class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        import json as _json

        return _json.dumps(
            {
                "ts": self.formatTime(record, self.datefmt),
                "level": record.levelname,
                "logger": record.name,
                "msg": record.getMessage(),
                **({"exc": self.formatException(record.exc_info)} if record.exc_info else {}),
            },
            default=str,
            ensure_ascii=False,
        )


_handler = logging.StreamHandler()
_handler.setFormatter(_JSONFormatter())
logging.root.handlers = [_handler]
logging.root.setLevel(settings.log_level)
logger = logging.getLogger("agent_runtime")
```

#### Despues

Nuevo fichero `agent_runtime/logging.py`:

```python
"""Structured logging configuration (structlog + stdlib)."""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.stdlib import BoundLogger, LoggerFactory

from agent_runtime.config import settings


def configure_logging() -> None:
    """Configure structured logging for the application."""
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            _format_processor(settings.log_level),
        ],
        context_class=dict,
        logger_factory=LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level.upper()),
    )


def _format_processor(log_level: str) -> Any:
    """JSON in production (INFO+), console with colors in development (DEBUG)."""
    if log_level.upper() == "DEBUG":
        return structlog.dev.ConsoleRenderer(colors=True)
    return structlog.processors.JSONRenderer(ensure_ascii=False)


def get_logger(name: str | None = None) -> BoundLogger:
    """Get a structured logger instance."""
    return structlog.get_logger(name)  # type: ignore[return-value]
```

En `main.py`, reemplazar todo el bloque de logging por:

```python
from agent_runtime.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("agent_runtime")
```

En `registry.py` y `health.py`, reemplazar:

```python
# Antes
import logging
logger = logging.getLogger(__name__)

# Despues
from agent_runtime.logging import get_logger
logger = get_logger(__name__)
```

Uso con context binding (ejemplo en `load_all`):

```python
# Antes
logger.info("Loaded %d active agents from Payload", len(new_agents))

# Despues
logger.info("Agents loaded from Payload", count=len(new_agents), slugs=list(new_agents.keys()))
```

#### Dependencia

```toml
# pyproject.toml
dependencies = [
    # ... existentes ...
    "structlog>=24.1",
]
```

---

### 2. Jerarquia de excepciones

**Problema**: agent-runtime usa `ValueError` para errores de configuracion de agentes y `HTTPException` directas en endpoints. No hay codigos de error machine-readable, no hay estructura consistente en las respuestas de error, y los errores de dominio estan acoplados a HTTP.

**Nixon usa**: Jerarquia `NixonError > DomainError/AuthError/ExternalServiceError` con `http_status`, `code` machine-readable, y `details` dict. Un exception handler global mapea todo a JSON consistente.

**Referencia Nixon**: `packages/nixon-server-core/src/nixon_server_core/core/exceptions.py`

#### Ficheros afectados

- **Nuevo**: `agent_runtime/exceptions.py`
- `agent_runtime/main.py` — anadir exception handler, reemplazar `HTTPException`
- `agent_runtime/registry.py` — reemplazar `ValueError` por excepciones tipadas

#### Despues

Nuevo fichero `agent_runtime/exceptions.py`:

```python
"""Domain exceptions with HTTP mapping.

Each exception carries an ``http_status`` so the FastAPI handler can map it
without the domain code knowing about HTTP.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from agent_runtime.logging import get_logger

logger = get_logger(__name__)


class AgentRuntimeError(Exception):
    """Base application error with structured error info."""

    http_status: int = 500

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.details: dict[str, Any] = details or {}
        super().__init__(message)


class AgentConfigError(AgentRuntimeError):
    """Invalid agent configuration from Payload."""

    http_status = 422


class InvalidModelError(AgentConfigError):
    """Malformed llmModel field."""

    def __init__(self, slug: str, llm_model: str) -> None:
        super().__init__(
            message=f"Invalid llmModel {llm_model!r}; expected 'provider/model-id'",
            code="INVALID_LLM_MODEL",
            details={"slug": slug, "llmModel": llm_model},
        )


class MissingApiKeyError(AgentConfigError):
    """Agent has no API key configured."""

    def __init__(self, slug: str) -> None:
        super().__init__(
            message=f"Agent {slug!r} has no apiKey",
            code="MISSING_API_KEY",
            details={"slug": slug},
        )


class UnsupportedProviderError(AgentConfigError):
    """LLM provider not supported."""

    def __init__(self, provider: str) -> None:
        super().__init__(
            message=f"Unsupported LLM provider {provider!r}. Expected: 'anthropic', 'openai'.",
            code="UNSUPPORTED_PROVIDER",
            details={"provider": provider},
        )


class PayloadFetchError(AgentRuntimeError):
    """Failed to fetch agents from Payload CMS."""

    http_status = 502

    def __init__(self, reason: str) -> None:
        super().__init__(
            message=f"Failed to fetch agents from Payload: {reason}",
            code="PAYLOAD_FETCH_ERROR",
            details={"reason": reason},
        )


class AuthenticationError(AgentRuntimeError):
    """Invalid or missing internal secret."""

    http_status = 401

    def __init__(self) -> None:
        super().__init__(
            message="Invalid internal secret",
            code="AUTH_INVALID_SECRET",
        )


async def agent_runtime_exception_handler(
    request: Request, exc: AgentRuntimeError
) -> JSONResponse:
    """Global exception handler — consistent JSON error responses."""
    logger.warning(
        "Request error",
        code=exc.code,
        message=exc.message,
        path=request.url.path,
        status=exc.http_status,
    )
    return JSONResponse(
        status_code=exc.http_status,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )
```

En `main.py`, registrar el handler:

```python
from agent_runtime.exceptions import AgentRuntimeError, agent_runtime_exception_handler

app.add_exception_handler(AgentRuntimeError, agent_runtime_exception_handler)  # type: ignore[arg-type]
```

En `registry.py`, reemplazar `ValueError`:

```python
# Antes
if not model_id:
    raise ValueError(
        f"Invalid llmModel {cfg.get('llmModel')!r}; expected 'provider/model-id'"
    )

# Despues
from agent_runtime.exceptions import InvalidModelError, MissingApiKeyError, UnsupportedProviderError

if not model_id:
    raise InvalidModelError(slug=cfg.get("slug", "unknown"), llm_model=str(cfg.get("llmModel", "")))
```

En `main.py`, reemplazar `HTTPException` en reload:

```python
# Antes
if not hmac.compare_digest(x_internal_secret or "", settings.internal_secret):
    raise HTTPException(status_code=401, detail="invalid internal secret")

# Despues
from agent_runtime.exceptions import AuthenticationError

if not hmac.compare_digest(x_internal_secret or "", settings.internal_secret):
    raise AuthenticationError()
```

---

## P1 — Importante

### 3. Ruff: reglas de seguridad y builtins

**Problema**: La config de Ruff del agent-runtime no incluye `S` (bandit — deteccion de vulnerabilidades) ni `A` (flake8-builtins — previene shadowing de builtins como `id`, `type`, `list`). Ambas estan en Nixon.

**Referencia Nixon**: `backend/pyproject.toml:45`

#### Ficheros afectados

- `pyproject.toml`

#### Antes (`pyproject.toml:38`)

```toml
[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "C4", "SIM", "RUF"]
ignore = ["E501"]
```

#### Despues

```toml
[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP", "B", "A", "C4", "S", "SIM", "RUF"]
ignore = ["E501"]

[tool.ruff.lint.per-file-ignores]
# Allow assert statements in tests
"**/tests/**/*.py" = ["S101"]
```

Tras el cambio, ejecutar `uv run ruff check .` y corregir los findings. Principales candidatos:
- `S101` — asserts en tests (ya ignorado con per-file-ignores)
- `A003` — shadowing de builtins (revisar si `id` se usa como variable)

---

### 4. Testing: cobertura critica

**Problema**: Solo hay 6 tests que cubren el happy path basico. Faltan tests para:
- `/ready` endpoint (happy path + DB caida + 0 agentes)
- Reload exitoso (respuesta con count y slugs)
- Agent building (`_build_model`, `_compose_instructions`, `_extract_taxonomy_slugs`)
- Edge cases (`llmModel` malformado, agente sin slug, Payload devuelve error HTTP)
- Lifespan retry logic

**Nixon tiene**: polyfactory, session-scoped fixtures, E2E + unit + integration, conftest de 600+ lineas.

**Referencia Nixon**: `server/tests/conftest.py`, `server/tests/factories/`

#### Ficheros afectados

- `tests/conftest.py` — ampliar fixtures
- `tests/test_health.py` — anadir tests de `/ready`
- `tests/test_registry.py` — anadir tests de building
- **Nuevo**: `tests/test_instructions.py` — tests de composicion de instrucciones

#### Despues — tests criticos a anadir

**`tests/conftest.py`** — nuevo fixture para agente sin slug:

```python
@pytest.fixture
def mock_payload_agent_no_slug() -> dict[str, Any]:
    return {
        "id": 2,
        "name": "Agent Without Slug",
        "isActive": True,
        "llmModel": "openai/gpt-4o-mini",
        "apiKey": "sk-test-key-456",
        "systemPrompt": "Test",
    }


@pytest.fixture
def mock_payload_agent_bad_model() -> dict[str, Any]:
    return {
        "id": 3,
        "slug": "bad-model",
        "name": "Bad Model Agent",
        "isActive": True,
        "llmModel": "invalid-no-slash",
        "apiKey": "sk-test-key-789",
        "systemPrompt": "Test",
    }
```

**`tests/test_registry.py`** — tests de building:

```python
@pytest.mark.asyncio
async def test_load_all_skips_agents_without_slug(
    mock_payload_agent_no_slug: dict[str, Any],
    mock_httpx_response: MagicMock,
) -> None:
    """Agents missing a slug field are logged and skipped."""
    mock_httpx_response.json.return_value = {"docs": [mock_payload_agent_no_slug], "totalDocs": 1}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_httpx_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("agent_runtime.registry.httpx.AsyncClient", return_value=mock_client),
        patch("agent_runtime.registry.PostgresDb"),
    ):
        from agent_runtime.registry import AgentRegistry

        registry = AgentRegistry()
        await registry.load_all()

    assert len(registry.all()) == 0


@pytest.mark.asyncio
async def test_load_all_skips_agents_with_invalid_model(
    mock_payload_agent_bad_model: dict[str, Any],
    mock_httpx_response: MagicMock,
) -> None:
    """Agents with malformed llmModel are logged and skipped."""
    mock_httpx_response.json.return_value = {"docs": [mock_payload_agent_bad_model], "totalDocs": 1}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_httpx_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with (
        patch("agent_runtime.registry.httpx.AsyncClient", return_value=mock_client),
        patch("agent_runtime.registry.PostgresDb"),
    ):
        from agent_runtime.registry import AgentRegistry

        registry = AgentRegistry()
        await registry.load_all()

    assert len(registry.all()) == 0


def test_extract_taxonomy_slugs_empty() -> None:
    from agent_runtime.registry import AgentRegistry

    assert AgentRegistry._extract_taxonomy_slugs(None) == []
    assert AgentRegistry._extract_taxonomy_slugs([]) == []


def test_extract_taxonomy_slugs_mixed_types() -> None:
    from agent_runtime.registry import AgentRegistry

    taxonomies = [{"slug": "author-1"}, "raw-slug", {"no-slug": True}, 42]
    result = AgentRegistry._extract_taxonomy_slugs(taxonomies)
    assert result == ["author-1", "raw-slug"]
```

**`tests/test_health.py`** — tests de `/ready`:

```python
@pytest.mark.asyncio
async def test_ready_returns_503_when_no_agents() -> None:
    with patch("agent_runtime.registry.PostgresDb"):
        from agent_runtime.main import app, registry

    from fastapi.testclient import TestClient

    registry._agents = {}  # Empty registry
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/ready")
    assert response.status_code == 503
    assert "No agents loaded" in response.json()["detail"]
```

**`tests/test_reload.py`** — test de reload exitoso:

```python
@pytest.mark.asyncio
async def test_reload_returns_count_and_slugs() -> None:
    with patch("agent_runtime.registry.PostgresDb"):
        from agent_runtime.main import app, registry

    from fastapi.testclient import TestClient

    with patch.object(registry, "reload", new_callable=AsyncMock):
        with patch.object(registry, "all", return_value=[MagicMock(), MagicMock()]):
            with patch.object(registry, "slugs", return_value=["agent-a", "agent-b"]):
                client = TestClient(app, raise_server_exceptions=False)
                response = client.post(
                    "/internal/agents/reload",
                    headers={"X-Internal-Secret": "dev"},
                )
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert data["slugs"] == ["agent-a", "agent-b"]
```

---

### 5. Separacion de responsabilidades en registry.py

**Problema**: `registry.py` (283 lineas) mezcla 5 responsabilidades:
1. Gestion de engine SQLAlchemy compartido (`_shared_engine`, `_get_shared_engine`, `dispose_shared_engine`)
2. Normalizacion de URLs PostgreSQL (`_normalize_pg_url`)
3. Llamadas HTTP a Payload CMS (`load_all`)
4. Construccion de agentes Agno (`_build`, `_build_model`, `_build_mcp_tools`)
5. Composicion de instrucciones/system prompts (`_compose_instructions`, `_TOOL_USE_PROTOCOL`)

**Nixon tiene**: Separacion limpia por modulo — cada fichero hace una cosa.

**Referencia Nixon**: `core/config.py` (config), `infrastructure/` (DB), `domain/` (logica), `application/` (orquestacion)

#### Ficheros afectados

- `agent_runtime/registry.py` — reducir a orquestacion
- **Nuevo**: `agent_runtime/db.py` — gestion de engine compartido
- **Nuevo**: `agent_runtime/builder.py` — construccion de agentes
- **Nuevo**: `agent_runtime/instructions.py` — composicion de system prompts

#### Despues — estructura propuesta

```
agent_runtime/
  config.py          # (sin cambios) Settings
  logging.py         # (nuevo, ver seccion 1)
  exceptions.py      # (nuevo, ver seccion 2)
  db.py              # (extraido de registry.py) Engine compartido + _normalize_pg_url
  instructions.py    # (extraido de registry.py) _compose_instructions + _TOOL_USE_PROTOCOL
  builder.py         # (extraido de registry.py) _build, _build_model, _build_mcp_tools
  registry.py        # Solo orquestacion: load_all, reload, get, all, slugs
  health.py          # (sin cambios)
  main.py            # (simplificado) App + lifespan + reload endpoint
```

**`agent_runtime/db.py`** — extraer gestion de DB:

```python
"""Shared async SQLAlchemy engine for health checks and session persistence."""

from __future__ import annotations

from agent_runtime.config import settings
from agent_runtime.logging import get_logger

logger = get_logger(__name__)

_shared_engine = None


def normalize_pg_url(url: str) -> str:
    """Force psycopg v3 driver (installed via agno[postgres])."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def get_shared_engine():  # type: ignore[return]
    """Lazily create a shared async SQLAlchemy engine."""
    global _shared_engine  # noqa: PLW0603
    if _shared_engine is None:
        from sqlalchemy.ext.asyncio import create_async_engine

        url = normalize_pg_url(settings.database_url).replace(
            "postgresql+psycopg://", "postgresql+psycopg_async://"
        )
        _shared_engine = create_async_engine(url, pool_size=1, pool_pre_ping=True)
    return _shared_engine


async def check_db() -> bool:
    """Quick SELECT 1 for readiness probes."""
    try:
        engine = get_shared_engine()
        async with engine.connect() as conn:
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.warning("DB health check failed", exc_info=True)
        return False


async def dispose_shared_engine() -> None:
    """Dispose the shared engine on shutdown."""
    global _shared_engine  # noqa: PLW0603
    if _shared_engine is not None:
        await _shared_engine.dispose()
        _shared_engine = None
```

**`agent_runtime/instructions.py`** — extraer composicion de prompts:

```python
"""System prompt composition for Agno agents."""

from __future__ import annotations

from typing import Any


_TOOL_USE_PROTOCOL = """\
## Tool use protocol
...  # (contenido actual sin cambios)
"""


def compose_instructions(cfg: dict[str, Any]) -> str:
    """Build the full system prompt from a Payload agent document."""
    parts: list[str] = []

    system_prompt = cfg.get("systemPrompt")
    if isinstance(system_prompt, str) and system_prompt.strip():
        parts.append(system_prompt.strip())

    taxonomy_slugs = extract_taxonomy_slugs(cfg.get("taxonomies"))
    if taxonomy_slugs:
        parts.append(f"[RAG filter: taxonomy_slugs={','.join(taxonomy_slugs)}]")

    search_collections = cfg.get("searchCollections")
    if isinstance(search_collections, list) and search_collections:
        parts.append(f"[RAG collections: {','.join(search_collections)}]")

    parts.append(_TOOL_USE_PROTOCOL)
    return "\n\n".join(parts)


def extract_taxonomy_slugs(taxonomies: list[Any] | None) -> list[str]:
    """Extract taxonomy slugs from populated Payload relationships."""
    if not isinstance(taxonomies, list):
        return []
    slugs: list[str] = []
    for item in taxonomies:
        if isinstance(item, dict) and isinstance(item.get("slug"), str):
            slugs.append(item["slug"])
        elif isinstance(item, str):
            slugs.append(item)
    return slugs
```

**`agent_runtime/registry.py`** — reducido a orquestacion (~80 lineas):

```python
"""Agent registry: loads configurations from Payload CMS, delegates building to builder module."""

from __future__ import annotations

from typing import Any

import httpx
from agno.agent import Agent
from agno.db.postgres import PostgresDb

from agent_runtime.builder import build_agent
from agent_runtime.config import settings
from agent_runtime.db import normalize_pg_url
from agent_runtime.logging import get_logger

logger = get_logger(__name__)

_PAYLOAD_TIMEOUT_S = 10.0


class AgentRegistry:
    """Thread-safe (single event loop) registry of Agno agents keyed by slug."""

    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}
        self._db = PostgresDb(
            db_url=normalize_pg_url(settings.database_url),
            db_schema=settings.database_schema,
        )

    @property
    def db(self) -> PostgresDb:
        return self._db

    def get(self, slug: str) -> Agent | None:
        return self._agents.get(slug)

    def all(self) -> list[Agent]:
        return list(self._agents.values())

    def slugs(self) -> list[str]:
        return list(self._agents.keys())

    async def load_all(self) -> None:
        """Fetch active agents from Payload and rebuild the registry."""
        docs = await self._fetch_from_payload()
        new_agents: dict[str, Agent] = {}
        for doc in docs:
            slug = doc.get("slug")
            if not slug:
                logger.warning("Skipping agent with missing slug", agent_id=doc.get("id"))
                continue
            try:
                new_agents[slug] = build_agent(doc, db=self._db)
            except Exception:
                logger.exception("Failed to build agent", slug=slug)

        self._agents = new_agents
        logger.info("Agents loaded from Payload", count=len(new_agents))

    async def reload(self) -> None:
        await self.load_all()

    async def _fetch_from_payload(self) -> list[dict[str, Any]]:
        """GET /api/agents?where[isActive]=true from Payload CMS."""
        url = f"{settings.payload_url.rstrip('/')}/api/agents"
        params: dict[str, str | int] = {
            "where[isActive][equals]": "true",
            "depth": 1,
            "limit": 1000,
        }
        headers: dict[str, str] = {"X-Internal-Request": "true"}
        if settings.payload_service_token:
            headers["Authorization"] = f"Bearer {settings.payload_service_token}"

        async with httpx.AsyncClient(timeout=_PAYLOAD_TIMEOUT_S) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()

        return response.json().get("docs", [])
```

La funcion `build_agent` iria en `builder.py` con `_build_model` y `_build_mcp_tools`.

---

## P2 — Recomendado

### 6. CI pipeline para Python

**Problema**: El CI existente en `.github/workflows/ci.yml` solo cubre los paquetes TypeScript (pnpm build, tsc, lint, test). No hay pipeline para el servicio Python. Cualquier cambio en agent-runtime puede romper sin que nadie se entere hasta produccion.

**Nixon tiene**: GitHub Actions completo que ejecuta en devcontainer con docker-compose (PostgreSQL + Redis + Typesense), corre ruff + mypy/pyright + pytest, y muestra logs on failure.

**Referencia Nixon**: `.github/workflows/test-backend.yml`

**Recomendacion**: Crear `.github/workflows/test-agent-runtime.yml` con:

1. **Trigger**: push/PR a `main` cuando cambie `services/agent-runtime/**`
2. **Steps**:
   - Checkout
   - Instalar uv (`astral-sh/setup-uv@v4`)
   - `uv sync --all-groups`
   - `uv run ruff check .`
   - `uv run mypy .` (o `uv run pyright` si se anade)
   - `uv run pytest -v`
3. **No necesita docker-compose** (los tests mockean DB y Payload) — a diferencia de Nixon, agent-runtime no tiene tests de integracion que requieran servicios reales

Ejemplo minimo:

```yaml
name: Agent Runtime CI

on:
  push:
    branches: [main]
    paths: ["services/agent-runtime/**"]
  pull_request:
    branches: [main]
    paths: ["services/agent-runtime/**"]

defaults:
  run:
    working-directory: services/agent-runtime

jobs:
  ci:
    name: Lint, Type Check & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --all-groups
      - run: uv run ruff check .
      - run: uv run mypy .
      - run: uv run pytest -v --tb=long
```

---

### 7. Type checking: pyright + stubs

**Problema**: agent-runtime tiene `ignore_missing_imports = true` en mypy, lo que anula gran parte del valor del type checking (cualquier import sin stubs se convierte en `Any` silenciosamente). Solo usa mypy, no pyright.

**Nixon tiene**: `ignore_missing_imports = false` + pyright en modo standard + stubs custom en `typings/`. Ademas, un script `check_types.sh` que corre ambos.

**Referencia Nixon**: `backend/pyproject.toml:65`, `backend/pyrightconfig.json`, `backend/scripts/check_types.sh`

**Recomendacion**:

1. **Crear `typings/` o stubs** para los modulos de agno que faltan — o al menos documentar cuales son con `# type: ignore[import-untyped]` inline en vez del global
2. **Cambiar a `ignore_missing_imports = false`** en mypy y resolver los imports problematicos uno a uno
3. **Anadir pyright** como segundo checker (opcional pero recomendado — es mas rapido y detecta cosas que mypy no):

```json
// pyrightconfig.json
{
  "pythonVersion": "3.12",
  "typeCheckingMode": "standard",
  "include": ["agent_runtime", "tests"],
  "reportMissingImports": true,
  "reportUnusedImport": true,
  "reportUnusedVariable": true
}
```

---

### 8. Observabilidad: correlation IDs

**Problema**: Cada linea de log del agent-runtime es independiente. Si un agente falla durante una peticion de chat, no hay forma de correlacionar los logs de la peticion HTTP, la carga del agente, y la respuesta del LLM.

**Nixon tiene**: `contextvars` para `correlation_id` y `actor_id`, propagados automaticamente a todos los logs y eventos de dominio via structlog context binding.

**Referencia Nixon**: `packages/nixon-server-core/src/nixon_server_core/core/context.py`

**Recomendacion**: Implementar un middleware FastAPI que:

1. Extraiga o genere un `X-Request-ID` por peticion
2. Lo guarde en un `contextvars.ContextVar`
3. Lo inyecte automaticamente en todos los logs via structlog processor

Ejemplo:

```python
# agent_runtime/middleware.py
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        request_id_var.set(rid)
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
```

Y en `logging.py`, anadir un processor de structlog:

```python
def _add_request_id(logger, method_name, event_dict):
    from agent_runtime.middleware import request_id_var
    rid = request_id_var.get("")
    if rid:
        event_dict["request_id"] = rid
    return event_dict
```

---

## P3 — Nice to have

### 9. Scripts de desarrollo

**Problema**: No hay scripts de conveniencia para tareas comunes de desarrollo. El developer tiene que recordar los comandos exactos de uv/ruff/mypy/pytest.

**Nixon tiene**: `scripts/check_types.sh` (corre mypy + pyright en todos los paquetes) y `scripts/devtools.sh` (menu interactivo con lint, test, migrations, seed data).

**Referencia Nixon**: `backend/scripts/check_types.sh`, `backend/scripts/devtools.sh`

**Recomendacion**: Anadir seccion `[tool.uv.scripts]` en `pyproject.toml` (como Nixon usa para migrations):

```toml
[tool.uv.scripts]
lint = "ruff check ."
lint-fix = "ruff check --fix ."
format = "ruff format ."
typecheck = "mypy ."
test = "pytest -v"
check = "ruff check . && mypy . && pytest -v"
```

Esto permite `uv run check` como single command para validar todo antes de commit.

---

### 10. Config: eliminar type: ignore

**Problema**: `settings = Settings()  # type: ignore[call-arg]` en `config.py:29`. Este hack existe porque `database_url` es un campo required sin default, y mypy se queja de que no se pasa al constructor.

**Nixon soluciona esto** con un `@lru_cache` getter function que atrapa el error en runtime en vez de silenciarlo en type checking.

**Referencia Nixon**: `packages/nixon-server-core/src/nixon_server_core/core/config.py`

**Recomendacion**: Reemplazar la instanciacion directa por un getter con cache:

```python
# Antes
settings = Settings()  # type: ignore[call-arg]

# Despues
from functools import lru_cache

@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

Esto sigue necesitando el `type: ignore` pero lo aisla en un unico punto, y el resto del codigo usa `get_settings()` que tiene tipo de retorno correcto. Alternativamente, dar un default vacio a `database_url` y validar en runtime:

```python
database_url: str = ""

def model_post_init(self, __context: Any) -> None:
    if not self.database_url:
        raise ValueError("DATABASE_URL is required")
```

---

## Orden de implementacion recomendado

```
Fase 1 (P0) — Fundamentos
  1. Structured logging (structlog) — base para todo lo demas
  2. Jerarquia de excepciones — errores consistentes

Fase 2 (P1) — Calidad
  3. Ruff: anadir S y A — rapido, detecta issues existentes
  5. Separacion de registry.py — facilita testing
  4. Testing: cobertura critica — requiere que 5 este hecho

Fase 3 (P2) — Infraestructura
  6. CI pipeline — protege todo lo anterior
  7. Type checking mejorado
  8. Correlation IDs

Fase 4 (P3) — Pulido
  9. Scripts de desarrollo
  10. Config sin type: ignore
```
