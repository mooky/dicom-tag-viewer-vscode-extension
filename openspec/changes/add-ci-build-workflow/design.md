## Context

The repository builds and packages the extension locally through two paths today:
- `npm run compile` / `npm run package:vsix` directly, or
- `build.cmd`, which shells out to `devcontainer up` + `devcontainer exec ... npm run package:vsix`, giving a reproducible build inside the `node:24-bookworm` devcontainer image.

There is no `.github/workflows` directory yet. This change adds the first CI workflow.

## Goals / Non-Goals

**Goals:**
- Build and package the extension automatically on push to `feature/**` branches and `main`.
- Produce a downloadable `.vsix` artifact from every such push.
- Keep the workflow fast.

**Non-Goals:**
- Full environment parity with the devcontainer/`build.cmd` path.
- Gating merges via `pull_request` checks (push-only, per explicit decision).
- Publishing/releasing the `.vsix` anywhere (e.g., Marketplace, GitHub Releases) — this only makes it downloadable as a workflow artifact.
- Running lint or tests — none exist in this repo today.

## Decisions

**Plain `ubuntu-latest` runner instead of the devcontainer.**
The devcontainer (`devcontainers/ci` action) would give CI the exact same environment as local `build.cmd` builds, but at the cost of spinning up a container on every run. Chosen alternative: `actions/setup-node` on `ubuntu-latest`, which is materially faster. Explicitly accepted trade-off: CI is not guaranteed to match the devcontainer environment 1:1 (e.g., future changes to `postCreateCommand` or the devcontainer image won't automatically apply in CI).

**Node 24 pinned via `actions/setup-node`.**
Matches the devcontainer's `node:24-bookworm` image so the Node major version stays consistent even though the rest of the environment isn't shared. Alternative considered: let `setup-node` float to a default LTS — rejected because it could silently drift from the version the project is developed against.

**Push-only triggers on `feature/**` and `main`; no `pull_request` event.**
Explicit decision: builds run on `push` to `feature/**` (covers nested feature branches too, e.g. `feature/foo/bar`) and on `push` to `main` (i.e., after a merge lands). No `pull_request` trigger, so there is no pre-merge CI gate — a bad merge can land on `main` and only be caught by the post-merge build.

**Build steps: `npm ci` → `npm run compile` → `npm run package:vsix` → upload artifact.**
`npm run compile` runs `tsc --noEmit` + esbuild dev bundle, catching type errors. `package:vsix` runs `vsce package`, whose `vscode:prepublish` hook only runs esbuild in production mode (no type checking) — so `compile` must run first, or a type error could slip through into a "successfully packaged" `.vsix`. The resulting `.vsix` is uploaded via `actions/upload-artifact`.

## Risks / Trade-offs

- **[Risk]** CI environment can drift from the devcontainer (different OS packages, Node patch version, etc.), so a build could pass in CI but fail via `build.cmd`, or vice versa. → **Mitigation**: none built into this change; accepted for speed. Revisit if drift causes real incidents.
- **[Risk]** No `pull_request` trigger means a broken merge to `main` is only caught after the fact, not blocked. → **Mitigation**: none — explicit scope decision. Could be added later as a separate change if branch protection is desired.
- **[Risk]** No lint/test step means `compile` + `package:vsix` succeeding doesn't mean the extension behaves correctly, only that it builds. → **Mitigation**: out of scope; repo has no test suite today.

## Open Questions

None outstanding — all key decisions (runner, Node version, triggers, build scope) were resolved during exploration.
