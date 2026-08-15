# syntax=docker/dockerfile:1

# Stage 1: build the bundled action entry point.
FROM node:26-slim AS build
WORKDIR /build
RUN npm install -g pnpm@11.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json tsconfig.json rolldown.config.ts ./
COPY src ./src
RUN pnpm run package

# Stage 2: runtime image.
FROM node:26-slim
WORKDIR /usr/src/app

# hadolint ignore=DL3008
RUN apt-get update && \
  apt-get install -y --no-install-recommends jing curl && \
  curl -Lsfo ./schxslt-cli.jar https://codeberg.org/SchXslt/schxslt/releases/download/v1.10.1/schxslt-cli.jar && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

COPY schemas ./schemas
COPY --from=build /build/dist ./dist

ENTRYPOINT ["node", "/usr/src/app/dist/index.js"]
