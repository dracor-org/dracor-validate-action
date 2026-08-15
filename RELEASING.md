# Releasing

Releases are driven by the [Release](.github/workflows/release.yml) workflow,
triggered manually with a bare semver string (`3.0.0`, `3.0.0-rc.1`; **no `v`
prefix**).

## Pinning contract

Once a version is released, consumers see the following behavior:

| Consumer writes                                                    | Runner behavior                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `uses: dracor-org/dracor-validate-action@3.0.0`                    | Pulls exactly `dracor/validate-action:3.0.0`.                                        |
| `uses: dracor-org/dracor-validate-action@3`                        | Pulls the latest `dracor/validate-action:3.x.y` image.                               |
| `uses: dracor-org/dracor-validate-action@main` or `@<sha on main>` | Runner builds the image from the current `Dockerfile` (no prebuilt image is pulled). |

`main` always keeps `image: Dockerfile` in `action.yml`. Only release commits
carry `image: docker://dracor/validate-action:<exact-version>`, and those
commits are referenced only by tags — they never land on `main`.

## Cutting a release

1. Land the changes on `main` and confirm CI is green.
2. On GitHub, go to **Actions → Release → Run workflow**.
3. Enter the `version` input (bare semver, no `v` prefix).
4. The workflow will:
   - Build and push a multi-arch image tagged `{version}`, `{major}.{minor}`,
     `{major}`.
   - Create a detached commit rewriting `action.yml` to point at
     `docker://dracor/validate-action:{version}`.
   - Create the `{version}` git tag on that commit and force-move the
     `{major}.{minor}` and `{major}` tags to the same commit.
   - Create a GitHub Release with auto-generated notes.
5. Verify the resulting tags and DockerHub image on a scratch workflow:

   ```yaml
   - uses: dracor-org/dracor-validate-action@3.0.0
     with:
       files: tei/*.xml
   ```

## Why the tag force-move is unavoidable

`{major}` and `{major}.{minor}` are floating pointers by design — every release
moves them onto the newest release commit. There is no non-destructive git
operation for moving a tag, so `git push --force` on those refs is expected. The
`{version}` tag is created fresh each release and does not conflict; the `-f`
flag on it is only there to make re-runs of the workflow idempotent.

## Re-running a release

Re-running the workflow with the same `version` input rebuilds and re-pushes
everything on top of the current `main`. The tags move to a new release commit;
the previous release commit becomes unreachable (garbage collected by GitHub
eventually). Only do this if you know the previous release commit was never
consumed by anyone pinning to that tag.
