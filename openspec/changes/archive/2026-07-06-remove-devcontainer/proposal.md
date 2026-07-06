## Why

The repo carries a `.devcontainer/devcontainer.json` and a `build.cmd` that drives the Dev Containers CLI, but the project's actual documented dev/verify loop (CLAUDE.md, launch configs) is Windows-native — Git Bash, PowerShell, and `code --extensionDevelopmentPath=.`. The dependencies (`dicom-parser`, `dicom-data-dictionary`, esbuild, tsc) are pure JS with no native bindings, so the container buys no cross-platform safety net, and it's a single-developer project with no other contributors to onboard. Keeping it means two parallel, undertested build paths (host vs. container) and a README that documents a workflow that isn't actually used.

## What Changes

- Remove `.devcontainer/devcontainer.json` and the `.devcontainer/` folder.
- Rewrite `build.cmd` to run the package build natively (`npm install` + `npm run package:vsix`) instead of shelling out to the `devcontainer` CLI. **BREAKING** for anyone currently relying on the container-based `build.cmd`/README flow — Docker Desktop and the Dev Containers CLI are no longer required or supported by this repo.
- Remove the `.devcontainer/**` exclusion from `.vscodeignore` (nothing left to exclude).
- Update `README.md` to drop the "Opening in a dev container" and "Package from a Windows `cmd.exe` prompt, using the dev container" sections, replacing them with the plain Windows-native steps (`npm install`, `npm run compile` / `npm run package:vsix`, F5 to launch).
- Update the `ci-build` spec's "Pinned Node version" scenario so it no longer justifies Node 24 by reference to the (now removed) devcontainer's Node version.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ci-build`: the "Pinned Node version" requirement's scenario text currently justifies Node 24 by pointing at the devcontainer's Node version; that justification is stale once the devcontainer is removed and needs rewording. The requirement itself (Node 24) is unchanged.

## Impact

- `.devcontainer/devcontainer.json` — deleted.
- `build.cmd` — rewritten to run natively on Windows, no Docker/devcontainer CLI dependency.
- `.vscodeignore` — drop stale `.devcontainer/**` line.
- `README.md` — devcontainer-based instructions removed; native Windows flow is the only documented path.
- `openspec/specs/ci-build/spec.md` — reword one scenario's rationale.
- No changes to `src/`, `package.json` dependencies, or the CI GitHub Actions workflow itself (it already runs on GitHub-hosted runners, not the devcontainer).
