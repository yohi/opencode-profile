FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# Bun (1.3.14) for parity with OpenCode upstream tooling.
ARG BUN_VERSION=1.3.14
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun || true

# GitHub CLI for `gh pr create`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

USER node
