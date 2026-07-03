## Why

Inspecting DICOM tag data today requires a dedicated desktop viewer or ad-hoc scripting outside the editor. Developers and integration engineers working on DICOM-adjacent tooling need a fast, in-context way to open a `.dcm` file and explore its tag structure — including nested sequences — without leaving VS Code.

## What Changes

- Add a VS Code desktop extension that registers a custom read-only editor for `.dcm` files.
- Opening a `.dcm` file (via drag-and-drop from File Explorer or double-click) parses it in the extension host and renders an explorable tag tree in a webview.
- The tree supports search/filter across tag, name, and value; recursive expansion of sequence (SQ) elements; a detail pane with VR-aware formatted values; and on-demand hex inspection for binary elements.
- Large binary payloads (e.g. pixel data) are excluded from the initial model and are only fetched on demand, so opening large files stays responsive.
- Users can copy a tag's identifier or value to the clipboard.

## Capabilities

### New Capabilities
- `dicom-file-editor`: Registers and manages the custom read-only editor for `.dcm` files — file association, reading, parsing into a serializable tag-tree model, and lazy binary/hex retrieval. Owns the extension-host side of the architecture.
- `dicom-tag-explorer`: The webview UI for exploring the parsed tag tree — collapsible groups and sequences, search/filter, detail pane with formatted values, on-demand hex view, and copy actions. Owns the webview side and the message protocol with `dicom-file-editor`.

### Modified Capabilities
- None (greenfield project, no existing specs).

## Impact

- New VS Code extension project (manifest, extension-host code, webview code, bundling via esbuild).
- New dependency on a pure-JS DICOM parsing library (e.g. `dicom-parser`) and a DICOM data dictionary for tag-name/VR lookup.
- No changes to existing systems — this is a new, standalone extension with no backend or network dependencies.
- Desktop-only for this change; vscode.dev/web extension support is explicitly out of scope.
