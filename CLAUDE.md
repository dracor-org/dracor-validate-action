# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project

GitHub Action that validates XML (TEI) documents against Relax NG and Schematron
schemas. Distributed as a Docker-based action and also published as the
`dracor/validate-action` Docker image usable standalone.

Scaffolded from
[actions/container-toolkit-action](https://github.com/actions/container-toolkit-action)
— that template explains the surrounding conventions (bundled `dist/`, Docker
action layout, workflow suite).

## Commands

- `pnpm install` — install dependencies
- `pnpm test` — run Vitest tests
- `pnpm exec vitest __tests__/utils.test.ts` — run a single test file
- `pnpm exec vitest -t "pattern"` — run tests matching a name pattern
- `pnpm run lint` — ESLint
- `pnpm run format:write` / `format:check` — Prettier
- `pnpm run package` — Rolldown-bundle `src/index.ts` → `dist/index.js`
- `pnpm run bundle` — format + package (run before committing)
- `pnpm run all` — full pre-commit workflow: format, lint, test with coverage,
  coverage badge, package

## Architecture

This is a **Docker-based GitHub Action**, not a JavaScript action, because it
needs the `jing` (Relax NG) and Java-based `schxslt-cli.jar` (Schematron) tools
installed in the runner. Flow:

1. [action.yml](action.yml) declares `runs.using: docker` pointing at
   [Dockerfile](Dockerfile), which installs `jing` + downloads `schxslt-cli.jar`
   and sets ENTRYPOINT to `node /usr/src/app/dist/index.js`.
2. [src/index.ts](src/index.ts) → [src/main.ts](src/main.ts) reads inputs via
   `@actions/core`, resolves file paths (glob or space-separated) via
   [src/utils.ts](src/utils.ts), and picks the schema files from the bundled
   [schemas/](schemas/) directory.
3. Relax NG validation shells out to `jing` and parses its stdout
   (`file:line:col: type: message`).
4. For the `dracor` schema, [src/schematron.ts](src/schematron.ts) additionally
   runs `schxslt-cli.jar` per file, parses the SVRL report with
   `@xmldom/xmldom` + `xpath`, and resolves line/column numbers by re-parsing
   the source XML with a locator-enabled DOM parser (SVRL only gives XPath
   locations).
5. Results are aggregated into a GitHub Actions job summary table
   (`core.summary`). Exit non-zero on errors unless `warn-only` is set.

Key detail: the schema directory is resolved as `../schemas` relative to the
bundled `dist/index.js`, so the layout `dist/index.js` + `schemas/` next to it
must be preserved in the container.

Supported schema versions live in [schemas/](schemas/) as
`tei_all_<version>.rng` and `dracor_<version>.rng`/`.sch`. Defaults are declared
in [src/config.ts](src/config.ts) (`TEI_VERSION`, `DRACOR_VERSION`). To add a
new schema version: drop the files into `schemas/`, bump the constant in
`config.ts` if it becomes the new default, and update [README.md](README.md).

## Committed `dist/`

The `dist/` directory is checked in and must match the source. The
[.github/workflows/check-dist.yml](.github/workflows/check-dist.yml) CI check
fails PRs whose `dist/` drifts. Always run `pnpm run bundle` (or `pnpm run all`)
before committing changes to `src/`.

## Testing conventions

Tests live in [**tests**/](__tests__/) and mock `@actions/core` /
`@actions/exec` via [**fixtures**/](__fixtures__/). Vitest hoists `vi.mock()`
calls above the imports, so the module under test is loaded via
`await import('../src/foo.js')` after the mocks are declared. Source imports use
explicit `.js` extensions (e.g. `from './utils.js'`) even though the sources are
`.ts`, because the emitted bundle is ESM.

## Package manager

The lockfile is `pnpm-lock.yaml`; the pnpm version is pinned via the
`packageManager` field in [package.json](package.json). CI installs pnpm via
`pnpm/action-setup` and runs `pnpm install --frozen-lockfile`. The Dockerfile
copies the prebuilt `dist/` and does not run a package manager.
