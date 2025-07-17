# DraCor Validate Action

<!-- [![GitHub Super-Linter](https://github.com/cmil/dracor-validate-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![Check `dist/`](https://github.com/cmil/dracor-validate-action/actions/workflows/check-dist.yml/badge.svg)
![CI](https://github.com/cmil/dracor-validate-action/actions/workflows/ci.yml/badge.svg)
[![Code Coverage](./badges/coverage.svg)](./badges/coverage.svg) -->

This GitHub Action validates XML files against different schemas and presents
the validation output in the action summary. Currently
[TEI-All](https://github.com/TEIC/TEI) and the
[DraCor Schema](https://github.com/dracor-org/dracor-schema) are supported. For
the DraCor Schema both the Relax NG and the Schematron rules are checked.

## Inputs

### `schema`

The schema to validate. Supported values are:

- `"tei"`: The TEI-All schema (default)
- `"dracor"`: The [DraCor schema](https://github.com/dracor-org/dracor-schema)

### `version`

The schema version to validate against. The defaults are `"4.9.0"` for TEI-All
and `"1.0.0"` for the DraCor schema.

### `files`

Path or pattern pointing to TEI files to validate. Default `"tei/*.xml"`

### `warn-only`

If you want to prevent the action from failing even if there are invalid files
set this to `"yes"`. This can be useful if you want to run the validation for
informational purposes only without possibly blocking pull requests from being
merged. Default `"no"`.

## Example usage

```yaml
jobs:
  validate_tei:
    runs-on: ubuntu-latest
    name: Validate TEI documents against TEI-All schema
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Validate against current TEI-All schema
        uses: dracor-org/dracor-validate-action@v1.0.0
      - name: Validate against older TEI-All schema
        uses: dracor-org/dracor-validate-action@v1.0.0
        with:
          version: '4.6.0'
          warn-only: 'yes'
      - name: Validate against current DraCor schema
        uses: dracor-org/dracor-validate-action@v1.0.0
        with:
          schema: dracor
```

## Validating locally

With docker installed this action can also be run locally to validate one or
more TEI files. You need to mount your local TEI files to the `/tei` directory
in the docker container and adjust the `files` input accordingly. For the
following examples we assume you are running the docker commands from the
directory containing a directory `tei`.

```sh
docker pull dracor/validate-action:latest
docker run --rm -it -e INPUT_FILES='/tei/*.xml' -v $PWD/tei:/tei dracor/validate-action
```

This validates each XML file in the `tei` directory against the latest supported
TEI version.

To validate against a different TEI version and/or to validate only specific
files you can pass the version number and a file pattern as input arguments:

```sh
docker run --rm -it \
  -e INPUT_SCHEMA=tei \
  -e INPUT_VERSION='4.6.0' \
  -e INPUT_FILES='/tei/lessing-*.xml' \
  -v $PWD/tei:/tei \
  dracor/dracor-validate-action
```

## Development

After you've cloned the repository to your local machine or codespace, you'll
need to perform some initial setup steps before you can develop your action.

> [!NOTE]
>
> You'll need to have reasonably modern versions of
> [Node.js](https://nodejs.org) and
> [Docker](https://www.docker.com/get-started/) handy (e.g. Node.js v20+ and
> docker engine v20+).

1. :hammer_and_wrench: Install the dependencies

   ```bash
   npm install
   ```

1. :building_construction: Package the TypeScript for distribution

   ```bash
   npm run bundle
   ```

1. :white_check_mark: Run the tests

   ```bash
   $ npm test

   ...
   ```

1. :hammer_and_wrench: Build the container

   ```bash
   docker build -t dracor/validate-action .
   ```

1. :white_check_mark: Test the container

   You can pass individual environment variables using the `--env` or `-e` flag.

   ```bash
   $ docker run --env INPUT_SCHEMA=dracor dracor/validate-action
   ...
   ```

   Or you can pass a file with environment variables using `--env-file`.

   ```bash
   $ echo "INPUT_VERSION='4.6.0'" > ./.env.test

   $ docker run --env-file ./.env.test dracor/validate-action
   ...
   ```
