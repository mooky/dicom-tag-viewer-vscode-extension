## 1. Project Scaffolding

- [x] 1.1 Initialize the VS Code extension project (package.json, extension manifest, TypeScript config) targeting desktop (Node) only
- [x] 1.2 Add `contributes.customEditors` entry: view type for the DICOM viewer, `filenamePattern: "*.dcm"`, `priority: "default"`
- [x] 1.3 Add esbuild config with two entry points: extension host (node target) and webview script (browser target)
- [x] 1.4 Add DICOM parsing dependency (e.g. `dicom-parser`) and a tag data dictionary dependency/data source
- [x] 1.5 Wire up extension activation event for the custom editor view type

## 2. Extension Host: Parsing and Model Building

- [x] 2.1 Implement file reading via `workspace.fs.readFile` for the opened document URI
- [x] 2.2 Implement DICOM parsing of file bytes into raw data elements (tag, VR, length, value/offset)
- [x] 2.3 Implement tag-name lookup against the data dictionary, with fallback labeling for unrecognized/private tags
- [x] 2.4 Implement VR-aware value formatting (dates, person names, UIDs resolved to known meanings, generic fallback for other VRs)
- [x] 2.5 Implement recursive handling of sequence (SQ) elements into nested `TreeNode.items`
- [x] 2.6 Implement large-binary exclusion: represent oversized/binary elements (including pixel data) with tag/VR/length + offset handle, omitting raw bytes from the model
- [x] 2.7 Define the `TreeNode` type and assemble the full parsed model
- [x] 2.8 Add parse-error handling that yields a well-defined error result instead of throwing uncaught

## 3. Custom Editor Provider

- [x] 3.1 Implement `DicomEditorProvider` as a `CustomReadonlyEditorProvider`
- [x] 3.2 Implement `openCustomDocument`: read + parse the file, produce a `CustomDocument` wrapping the model (or error state)
- [x] 3.3 Implement `resolveCustomEditor`: configure webview options (`enableScripts`, `localResourceRoots`) and set webview HTML
- [x] 3.4 Implement `ready` handshake: send the `model` message once the webview signals it has loaded
- [x] 3.5 Implement `requestHex` handler: read the requested byte range from the source file and respond with a `hexChunk` message
- [x] 3.6 Implement `copy` handler: write requested text to the system clipboard
- [x] 3.7 Register the provider in `activate()`

## 4. Webview: Tree Rendering and Search

- [x] 4.1 Build webview HTML/CSS shell using VS Code theme CSS variables
- [x] 4.2 Implement `acquireVsCodeApi()` wiring and the `ready`/`model` message handshake
- [x] 4.3 Implement virtualized tree list rendering from the `TreeNode` model, with expand/collapse per row
- [x] 4.4 Implement recursive rendering of nested sequence (SQ) items, independent per-row expand/collapse state
- [x] 4.5 Implement search/filter input that filters visible rows by tag, name, or value, preserving ancestor visibility for nested matches
- [x] 4.6 Implement clearing search to restore prior expand/collapse state

## 5. Webview: Detail Pane and Hex View

- [x] 5.1 Implement detail pane showing tag, name, VR, length, and formatted value for the selected row
- [x] 5.2 Implement on-demand hex view: send `requestHex` for elements without inlined bytes, render returned `hexChunk` bytes as hex
- [x] 5.3 Implement copy actions for tag identifier and value, posting `copy` messages to the extension host

## 6. Error Handling and Edge Cases

- [x] 6.1 Implement webview error state UI for documents that failed to parse
- [x] 6.2 Verify extension host stability (no crash/hang) when opening malformed or non-DICOM `.dcm` files
- [x] 6.3 Verify responsiveness opening a file with large pixel data (initial model excludes bytes; hex view fetches on demand)

## 7. Manual Verification

- [x] 7.1 Verify drag-and-drop of a `.dcm` file from Windows File Explorer onto VS Code opens the custom editor
- [x] 7.2 Verify double-click open from the VS Code Explorer view
- [x] 7.3 Verify search/filter, sequence expansion, detail pane formatting, hex view, and copy actions against representative sample `.dcm` files (including at least one with nested sequences and one with pixel data)
