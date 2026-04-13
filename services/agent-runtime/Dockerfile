# syntax=docker/dockerfile:1.7
#
# Uses ghcr.io/astral-sh/uv:python3.12-bookworm-slim as the base because it
# bundles Python 3.12 + uv and lets us skip Docker Hub entirely (convenient
# when upstream registries have flaky TLS through Cloudflare R2).

ARG BASE_IMAGE=ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# ── Build stage ────────────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS builder

ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Install dependencies first to maximise layer caching
COPY pyproject.toml uv.lock README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Then copy source and finalise the venv
COPY agent_runtime ./agent_runtime
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

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

CMD ["uvicorn", "agent_runtime.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
