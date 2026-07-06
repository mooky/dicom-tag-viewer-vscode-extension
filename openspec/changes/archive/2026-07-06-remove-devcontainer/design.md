## Context

`build.cmd` and `README.md` currently describe two parallel ways to build/package the extension: directly on the host (`npm install` / `npm run package:vsix`) and inside the `.devcontainer` via the Dev Containers CLI. All dependencies are pure JS (no native bindings), the project has one contributor, and the documented dev/verify loop in `CLAUDE.md` and `.vscode/launch.json` is already Windows-native. The container path is unused and untested.

## Goals / Non-Goals

**Goals:**
- Remove the devcontainer config and all references to it.
- Make `build.cmd` do the same job (produce the `.vsix`) using only tools already on the Windows host (Node/npm).
- Leave README/CLAUDE.md/spec docs accurate — no dangling references to Docker, the Dev Containers CLI, or the devcontainer image.

**Non-Goals:**
- No change to the GitHub Actions CI workflow (`.github/workflows/*`) — it already runs on GitHub-hosted runners, not the devcontainer.
- No change to `package.json` scripts (`compile`, `watch`, `package`, `package:vsix` stay as-is).
- Not introducing any new build tooling.

## Decisions

- **`build.cmd` runs `npm install` + `npm run package:vsix` directly**, matching what the container previously did inside itself, so the script's job (produce a `.vsix` non-interactively) doesn't change — only how it gets there.
- **Delete rather than deprecate** `.devcontainer/`: there's no migration path to preserve (single contributor, no in-flight container-based workflows to support).
- **Reword, don't remove, the `ci-build` Node-version scenario**: the requirement (pin Node 24) still holds and still matters for parity with local dev — it just needs a rationale that doesn't cite the devcontainer.

## Risks / Trade-offs

- [Losing the "no Node install needed on host" option that the devcontainer provided] → Not a real loss in practice: CLAUDE.md already assumes Node/npm/gh are verified on PATH before workflows run, so this was already the operative constraint.
- [Someone re-adds a devcontainer later without reading this history] → Mitigated by this change being visible in git history and the openspec archive.
