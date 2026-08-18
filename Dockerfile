# syntax=docker/dockerfile:1

ARG SAXON_VERSION=13.0
ARG XMLRESOLVER_VERSION=6.0.23
ARG SCHXSLT2_VERSION=1.11.2

# Stage 1: build the bundled action entry point.
FROM node:26-slim AS build
WORKDIR /build
RUN npm install -g pnpm@11.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json tsconfig.json rolldown.config.ts ./
COPY src ./src
RUN pnpm run package

# Stage 2: precompile every DraCor Schematron schema to a validator XSLT
# using the schxslt2 transpiler. Only the compiled `.xsl` outputs move
# forward into the runtime stage — the transpiler stylesheets stay here.
FROM debian:bookworm-slim AS schemas
ARG SAXON_VERSION
ARG XMLRESOLVER_VERSION
ARG SCHXSLT2_VERSION
WORKDIR /work
# hadolint ignore=DL3008
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
    ca-certificates curl unzip default-jre-headless && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
RUN curl -Lsfo saxon.jar \
    "https://repo1.maven.org/maven2/net/sf/saxon/Saxon-HE/${SAXON_VERSION}/Saxon-HE-${SAXON_VERSION}.jar" && \
  curl -Lsfo xmlresolver.jar \
    "https://repo1.maven.org/maven2/org/xmlresolver/xmlresolver/${XMLRESOLVER_VERSION}/xmlresolver-${XMLRESOLVER_VERSION}.jar" && \
  curl -Lsfo schxslt2.zip \
    "https://codeberg.org/SchXslt/schxslt2/releases/download/v${SCHXSLT2_VERSION}/schxslt2-${SCHXSLT2_VERSION}.zip" && \
  unzip -q schxslt2.zip && \
  mv "schxslt2-${SCHXSLT2_VERSION}" schxslt2 && \
  rm schxslt2.zip
COPY schemas /input
RUN mkdir -p /output && \
  for sch in /input/dracor_*.sch; do \
    name=$(basename "$sch" .sch); \
    echo "Compiling ${name}.sch"; \
    java -cp "saxon.jar:xmlresolver.jar" net.sf.saxon.Transform \
      -s:"$sch" \
      -xsl:schxslt2/transpile.xsl \
      -o:"/output/${name}.xsl"; \
  done

# Stage 3: runtime image.
# `jing` transitively depends on default-jre, which Saxon also needs, so
# there's no explicit JRE install here.
FROM node:26-slim
WORKDIR /usr/src/app

# hadolint ignore=DL3008
RUN apt-get update && \
  apt-get install -y --no-install-recommends \
    ca-certificates jing && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

COPY schemas ./schemas
COPY --from=schemas /output/*.xsl ./schemas/
COPY --from=schemas /work/saxon.jar /work/xmlresolver.jar ./
COPY --from=build /build/dist ./dist

ENTRYPOINT ["node", "/usr/src/app/dist/index.js"]
