# syntax=docker/dockerfile:1.7
#
# Build context expected at the workspace root (`backend/`). Targets the
# `agno-agent` member of the uv workspace; that member depends on
# `agno-agent-builder` (also in the workspace, eventually consumed from
# PyPI by external repos).

ARG BASE_IMAGE=ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# ── Build stage ────────────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS builder

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY agno-agent-builder/pyproject.toml ./agno-agent-builder/pyproject.toml
COPY agno-agent-builder/README.md ./agno-agent-builder/README.md
COPY agno-agent/pyproject.toml ./agno-agent/pyproject.toml
COPY agno-agent/README.md ./agno-agent/README.md
COPY payload-worker-builder/pyproject.toml ./payload-worker-builder/pyproject.toml
COPY payload-worker-builder/README.md ./payload-worker-builder/README.md
COPY payload-worker/pyproject.toml ./payload-worker/pyproject.toml
COPY payload-worker/README.md ./payload-worker/README.md
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-workspace --all-packages

COPY agno-agent-builder/agno_agent_builder ./agno-agent-builder/agno_agent_builder
COPY agno-agent/agno_agent ./agno-agent/agno_agent
COPY payload-worker-builder/payload_worker_builder ./payload-worker-builder/payload_worker_builder
COPY payload-worker/payload_worker ./payload-worker/payload_worker
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --all-packages

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY --from=builder /app /app

RUN groupadd --system --gid 1001 agent \
 && useradd  --system --uid 1001 --gid agent agent \
 && chown -R agent:agent /app

USER agent

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://localhost:8000/health', timeout=2)"

CMD ["uvicorn", "agno_agent.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
