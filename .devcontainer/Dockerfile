FROM node:25-alpine

RUN apk add --no-cache \
    git \
    bash \
    curl \
    docker-cli docker-cli-buildx docker-cli-compose

# Claude CLI (official installer)
RUN curl -fsSL https://claude.ai/install.sh | bash

# uv (Python package runner) — needed for MCP servers like mcpdoc
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -s /root/.local/bin/uv /usr/local/bin/uv && \
    ln -s /root/.local/bin/uvx /usr/local/bin/uvx

# Bun
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

# pnpm via corepack (--force needed on Node 25 due to yarn conflicts)
RUN npm install -g corepack --force && \
    corepack enable && \
    corepack prepare pnpm@10.14.0 --activate

WORKDIR /workspace

SHELL ["/bin/bash", "-c"]

CMD ["sleep", "infinity"]
