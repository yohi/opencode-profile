# Bun (1.3.14) for parity with OpenCode upstream tooling.
# https://bun.sh/docs/installation#docker
FROM oven/bun:1.3.14 AS bun

FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# GitHub CLI for `gh pr create`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

USER node
