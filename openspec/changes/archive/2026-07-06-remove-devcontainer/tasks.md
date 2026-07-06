## 1. Remove devcontainer config

- [x] 1.1 Delete `.devcontainer/devcontainer.json` and the now-empty `.devcontainer/` folder.
- [x] 1.2 Remove the `.devcontainer/**` line from `.vscodeignore`.

## 2. Make build.cmd Windows-native

- [x] 2.1 Rewrite `build.cmd` to run `npm install` then `npm run package:vsix` directly (no `devcontainer up`/`devcontainer exec`), preserving its non-interactive/CI-safe behavior and non-zero exit code on failure.
- [x] 2.2 Update the header comment in `build.cmd` to describe the native flow and drop the Docker Desktop / devcontainer CLI prerequisite note.

## 3. Update README.md

- [x] 3.1 Remove the "Opening in a dev container (recommended for a consistent toolchain)" section.
- [x] 3.2 Remove the "Package from a Windows `cmd.exe` prompt, using the dev container" section, keeping `build.cmd` documented as a plain native build script.
- [x] 3.3 Re-read the remaining Development/Packaging sections top to bottom to confirm no dangling references to Docker, Dev Containers, or the container image remain, and that the native `npm install` / `npm run compile` / `npm run package:vsix` flow reads as the only path.

## 4. Update ci-build spec

- [x] 4.1 Confirm the delta at `openspec/changes/remove-devcontainer/specs/ci-build/spec.md` correctly rewords the "Pinned Node version" scenario to drop the devcontainer reference.

## 5. Verify

- [x] 5.1 Run `build.cmd` from a Windows `cmd.exe`/PowerShell prompt and confirm it produces `dicom-tag-viewer-<version>.vsix` in the repo root.
- [x] 5.2 Run `npm run compile` and confirm it still passes.
- [x] 5.3 Grep the repo (excluding `openspec/changes/archive/**`) for `devcontainer` (case-insensitive) and confirm no remaining references outside the archived change history.
