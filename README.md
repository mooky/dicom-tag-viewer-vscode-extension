# DICOM Tag Viewer

A VS Code extension that opens `.dcm` files in a read-only custom editor showing an explorable, searchable tag tree — including nested sequences, VR-aware formatted values, and on-demand hex inspection for binary elements (e.g. pixel data).

## Development

```
npm install
npm run compile
```

### Opening in a dev container (recommended for a consistent toolchain)

This repo includes a [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json) so you can build, compile, and package the extension without installing Node/npm on the host machine.

Prerequisites:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another devcontainer-compatible container engine) running locally
- The [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) VS Code extension (listed in `.vscode/extensions.json`, so VS Code will prompt to install it automatically)

To use it:

1. Open this folder in VS Code.
2. When prompted "Reopen in Container", click it — or run **Dev Containers: Reopen in Container** from the Command Palette (`Ctrl+Shift+P`).
3. VS Code builds/pulls the container image (`mcr.microsoft.com/devcontainers/javascript-node:24-bookworm`) and runs `npm install` automatically (`postCreateCommand`).
4. Once the window has reloaded inside the container, everything below — `npm run compile`, `npm run watch`, **F5** to launch the Extension Development Host, and `npm run package:vsix` — works exactly the same as running on the host.

The generated `.vsix` file appears in your workspace folder on the host (it's a bind mount), so it's usable outside the container the same way as a locally-built one.

### Running the extension (recommended: F5)

Open this folder in VS Code and press **F5** (or use the "Run Extension" launch configuration). This launches a fresh Extension Development Host window with the extension loaded, and does not pass any file to open — you pick a file yourself once the window is up. Then either:

- Double-click a `.dcm` file in the Explorer sidebar (e.g. `sample-files/valid-sample.dcm`), or
- Drag a `.dcm` file from Windows File Explorer and drop it onto the editor area.

`npm run watch` (or the `watch` script) rebuilds on save; reload the Extension Development Host window (`Ctrl+R` / `Cmd+R`) to pick up changes.

### Testing via the CLI instead of F5

If you launch the Extension Development Host from the command line rather than F5, be aware of a startup race:

```bash
# Avoid: passing a file path together with --extensionDevelopmentPath
code --extensionDevelopmentPath=. path/to/file.dcm
```

Passing a file path as a CLI argument can open that file *before* the development extension's contribution points (including `contributes.customEditors`) finish registering with the editor resolver. When that race is lost, VS Code falls back to its built-in binary-file viewer for that tab instead of routing to the DICOM Tag Viewer — and it does not retry once the extension is ready. This looks like the extension is broken when it isn't.

To test via the CLI without hitting the race, open the **folder** only, then open the `.dcm` file from inside the running window (double-click or drag-and-drop), the same as the F5 workflow:

```bash
code --extensionDevelopmentPath=. .
```

If you do need to script opening a specific file for a one-off check, launch with the folder first, wait for the window to finish loading, and only then open the file — or just use F5, which sidesteps the issue entirely since it never opens a file via CLI argument.

## Packaging as a .vsix

This extension isn't published to the VS Code Marketplace (`publisher: "local-dev"`, `private: true`), so it can't be installed by searching in the Extensions view. Instead, package it as a `.vsix` file and install that directly.

### Package

```bash
npm install
npm run package:vsix
```

This runs the production build (type-check + minified esbuild bundle) and produces `dicom-tag-viewer-<version>.vsix` in the repo root, containing only `package.json`, `readme.md`, and the compiled `dist/` output (no source, no `node_modules`, no dev tooling — see `.vscodeignore`).

### Deploy to a new computer

1. Copy the generated `.vsix` file to the target machine (USB, network share, cloud drive, etc.).
2. Install it:
   - CLI: `code --install-extension path\to\dicom-tag-viewer-0.0.1.vsix`
   - Or in VS Code: Extensions view → `...` menu → **Install from VSIX...** → select the file.

After installing, `.dcm` files open in the DICOM Tag Viewer automatically — no dev mode or F5 required. To pick up a new version, repackage and reinstall the `.vsix` (VS Code will overwrite the existing install).

## Sample files

`sample-files/generate-samples.js` generates small synthetic `.dcm` fixtures used for manual verification:

- `valid-sample.dcm` — nested sequences, a private tag, and modest pixel data
- `large-pixeldata.dcm` — 8 MB pixel data, for checking that opening large files stays responsive
- `not-dicom.dcm` — not a DICOM file, for checking graceful error handling

Regenerate with:

```bash
node sample-files/generate-samples.js
```
