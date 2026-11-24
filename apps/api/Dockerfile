# syntax=docker/dockerfile:1
#
# Khums API container (M4.7: Render Free, docs/DEPLOYMENT_FREE_TIER.md §3). Build from the
# REPOSITORY ROOT (monorepo): `docker build -f apps/api/Dockerfile .`
#
# - Node 26 (the API needs >= 24.7 for `crypto.argon2`).
# - Stage 1 installs the API and its workspace packages, bundles the API (shared @khums/*
#   TypeScript is compiled into dist/main.js) and prunes to production dependencies.
# - Stage 2 holds only dist/ and production node_modules, runs as the unprivileged `node` user,
#   and contains no secret: every secret is set in the host's environment at runtime.
# - The checkpoint signing key must NEVER be set here (the API refuses to start with it).
#
# Pin the base image by digest before the first deployment (see the runbook).
ARG NODE_IMAGE=node:26-bookworm-slim
ARG PNPM_VERSION=11.28.12

FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
ENV CI=true
# Node 25+ ships without Corepack: install the repository's pinned pnpm version.
RUN npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@khums/api..."
RUN pnpm --filter @khums/api build
RUN pnpm --filter @khums/api deploy --prod /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    # Render Free has 512 MB: cap the heap so the process fails clearly instead of being killed.
    NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 10000
CMD ["node", "--enable-source-maps", "dist/main.js"]
