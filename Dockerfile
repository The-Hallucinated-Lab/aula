# syntax=docker/dockerfile:1.7

# =============================================================================
# Aula — browser build.
#
# WHAT THIS IS, AND WHAT IT IS NOT
#
# Aula ships as a Windows desktop application. This image does not contain it,
# and it is not how anybody should run it in an institution.
#
# What it contains is the renderer, built with `--mode web`, which the project
# already supports because the whole UI runs in a plain browser: `platform.ts`
# degrades the Electron bridge to Blob downloads and a file input, so save and
# open still work. What is missing is the local assistant, which needs the
# main-process relay, and native file dialogs.
#
# It exists for three things: a demonstration anybody can open without an
# installer, a review environment for a pull request, and a reproducible build
# host in CI.
#
# There is no server-side anything here. The output is static files and a
# process to serve them.
# =============================================================================

# ---- 1. dependencies --------------------------------------------------------
# Separated from the build so a source change does not re-resolve the tree.
FROM node:24.18.1-alpine AS deps
WORKDIR /app

# Only what npm needs to resolve the workspace graph. Copying the whole tree
# here would invalidate this layer on every source edit.
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/desktop/package.json ./apps/desktop/
COPY tools/scripts/install-git-hooks.mjs ./tools/scripts/

# `ci`, not `install`: the lockfile is the input.
# CI=true makes the hook installer skip itself — there is no .git here anyway.
#
# ELECTRON_SKIP_BINARY_DOWNLOAD: this image is the renderer. Pulling a ~100 MB
# Electron binary for a build that never launches it is pure waste.
#
# Install scripts are gated by npm's `allowScripts`, and the one this build
# needs — esbuild, for the verification harness — is recorded in package.json,
# so it runs here without anything having to be approved interactively.
ENV CI=true
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---- 2. build ---------------------------------------------------------------
FROM node:24.18.1-alpine AS build
WORKDIR /app
ENV CI=true

# The whole resolved tree, not named `node_modules` paths.
#
# npm hoists what it can: `packages/core/node_modules` does not exist at all
# today because everything it needs lives at the root, while
# `apps/desktop/node_modules` does because some of its dependencies cannot
# hoist. Naming those paths bakes a hoisting decision into the build, and the
# COPY fails the day npm makes a different one.
COPY --from=deps /app /app
COPY . .

# The same gate a pull request has to pass. An image that builds from code
# which does not typecheck is an image nobody should trust.
RUN npm run typecheck \
    && npm run test \
    && npm run verify \
    && npm run build:web

# ---- 3. runtime -------------------------------------------------------------
# nginx-unprivileged: the stock nginx image wants root to bind port 80 and to
# write its pid. This one runs as uid 101 and listens on 8080, which is what
# lets the container run with a read-only root filesystem and no capabilities.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

LABEL org.opencontainers.image.title="Aula (browser build)" \
      org.opencontainers.image.description="Constraint-driven university timetable planner — renderer only. The shipped product is a Windows desktop application." \
      org.opencontainers.image.source="https://github.com/The-Hallucinated-Lab/aula" \
      org.opencontainers.image.licenses="UNLICENSED"

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/desktop/dist /usr/share/nginx/html

EXPOSE 8080

# Static files and a health endpoint; nothing to warm up, so a short interval
# and a low retry count are honest.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

USER 101
