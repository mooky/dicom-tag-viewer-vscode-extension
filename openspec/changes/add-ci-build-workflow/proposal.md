## Why

There is no continuous integration for this repository. Changes on feature branches and merges to `main` build and package locally only (via `build.cmd` and the devcontainer), so a broken build isn't caught until someone runs it by hand, and there's no easy way to grab a `.vsix` for a given push without doing a local build.

## What Changes

- Add a GitHub Actions workflow that runs on every `push` to `feature/**` branches and to `main`.
- The workflow runs on `ubuntu-latest` with Node 24 pinned (matching the devcontainer's `node:24-bookworm` image, though the workflow does not use the devcontainer itself — see design.md for the tradeoff).
- Build steps: checkout, setup Node 24, `npm ci`, `npm run compile` (typecheck + esbuild bundle), `npm run package:vsix` (produces the `.vsix`).
- Upload the produced `.vsix` as a downloadable workflow artifact.
- No `pull_request` trigger — push-only, on both branch patterns.

## Capabilities

### New Capabilities
- `ci-build`: Automated build-and-package workflow triggered on push to feature branches and main, producing a downloadable `.vsix` artifact.

### Modified Capabilities
(none)

## Impact

- Adds `.github/workflows/build.yml`.
- No changes to existing extension code, `package.json` scripts, or the devcontainer.
- CI builds run on plain `ubuntu-latest` rather than inside the devcontainer, so there is a known parity gap between CI builds and local `build.cmd`/devcontainer builds (accepted tradeoff for speed).
