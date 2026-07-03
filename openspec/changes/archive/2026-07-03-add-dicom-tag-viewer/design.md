## Context

This is a greenfield VS Code desktop extension (no existing specs or code in this repo). DICOM files are structured binary: an optional 128-byte preamble + "DICM" magic, a File Meta group (0002,xxxx) declaring the transfer syntax, followed by an ordered sequence of data elements. Elements can nest arbitrarily via Sequence (SQ) VR, and pixel data (7FE0,0010) can range from empty to hundreds of megabytes. The goal is an in-editor viewer that opens `.dcm` files (via drag-and-drop from File Explorer or double-click) and presents the tag structure as an explorable, searchable tree — without the UI stalling on large binary payloads.

Constraints carried over from exploration:
- Desktop-only; no vscode.dev/web extension support in this change.
- MVP file association is the `.dcm` extension only — no magic-byte sniffing or extensionless-file handling.
- Read-only viewer — no editing, saving, or anonymization.

## Goals / Non-Goals

**Goals:**
- Seamless open of `.dcm` files via VS Code's built-in drag-and-drop and double-click, with zero custom drop handling.
- Responsive opening even for files with large pixel data, by excluding large binary payloads from the initial render model.
- An explorable tree: recursive sequence nesting, search/filter across tag/name/value, human-readable tag names and VR-aware formatted values, and on-demand hex inspection for binary elements.
- Clean separation between trusted parsing logic (extension host) and sandboxed rendering (webview), matching VS Code's custom editor security model.

**Non-Goals:**
- Pixel data image/thumbnail rendering or decoding of compressed transfer syntaxes.
- DICOMDIR or multi-file/series navigation.
- Editing, anonymizing, or saving DICOM files.
- Comparing two files.
- Web extension / vscode.dev support.
- Auto-detecting DICOM content in extensionless files.

## Decisions

### 1. `CustomReadonlyEditorProvider` over `CustomTextEditorProvider` or read-write `CustomEditorProvider`
DICOM files are binary, not text, ruling out `CustomTextEditorProvider`. A read-write `CustomEditorProvider` brings save/undo/backup machinery this viewer doesn't need. `CustomReadonlyEditorProvider` (the same base as VS Code's built-in Hex Editor and image preview) gives the minimal lifecycle: `openCustomDocument` → `resolveCustomEditor`, no save/dirty-state handling.

### 2. File association via `contributes.customEditors` with `filenamePattern: "*.dcm"`
VS Code's OS drag-and-drop from File Explorer is built-in: dropping a file onto the editor area opens its URI and routes it through the registered custom editor for a matching glob — no custom drop handler is required. Restricting the selector to `*.dcm` (rather than a wildcard or magic-byte sniff) keeps the MVP simple and avoids fighting other editors over untyped files. Trade-off: DICOM files without the `.dcm` extension won't auto-open in this viewer; explicitly deferred (see Non-Goals).

### 3. Two-process split: parsing/formatting in the extension host, rendering-only in the webview
The extension host has full Node/`fs` access and is the trusted side; the webview is sandboxed (CSP, no filesystem, no Node) and untrusted-facing. The host reads the file (`workspace.fs.readFile`), parses it with a pure-JS DICOM library, resolves tag names via a data dictionary, formats values per VR (dates, PN, UIDs, resolved UID meanings), and produces a serializable `TreeNode` model. The webview only renders that model and reports user interactions back via `postMessage`. This keeps all DICOM domain logic in one place and lets the webview stay a thin, swappable UI layer.

### 4. Exclude large binary from the initial model; fetch hex on demand
Pixel data and other large binary elements are represented in the initial model only by tag/VR/length and an offset handle — never their bytes. The webview requests bytes only when the user opens the detail/hex view for that specific element, via a `requestHex` message answered with a bounded `hexChunk`. This bounds the size of the initial `postMessage` payload regardless of file size and keeps opening large files responsive.

### 5. Message protocol shape
```
ext -> webview:
  { type: 'model',    root: TreeNode }
  { type: 'hexChunk', id, offset, bytes: base64 }
webview -> ext:
  { type: 'ready' }
  { type: 'copy',       text }
  { type: 'requestHex', id, offset, length }
```
The protocol is additive by design (new message types can be introduced without breaking existing handlers), leaving room for a future `export` message if that capability is added later.
`TreeNode` carries `tag`, `name`, `vr`, `length`, an optional formatted `value`, an optional `binary: { id, offset }` handle for elements whose bytes weren't inlined, and an optional `items: TreeNode[]` for sequence (SQ) nesting.

### 6. Parsing library: pure-JS, extension-host only
A pure-JS DICOM parser (e.g. `dicom-parser`) runs in the extension host. Because parsing never touches the webview or the DOM, there's no dependency on browser APIs there; this also keeps the option of web-extension support open later without changing the parsing approach, even though it's out of scope now.

### 7. Webview stack: plain HTML/CSS/TS, no framework
Given the UI is a tree + search box + detail pane, a framework isn't needed. Plain markup/CSS/TS keeps the bundle small and lets the tree use VS Code's theme CSS variables directly for native look-and-feel. A virtualized list renders only visible rows so large flattened tag trees (many top-level elements, or deeply repeated sequence items) stay smooth to scroll and filter.

### 8. Bundling: esbuild for both extension host and webview scripts
Two esbuild entry points (extension `node` target, webview `browser` target) keep build times fast and output small, matching common VS Code extension scaffolding.

## Risks / Trade-offs

- **Extensionless DICOM files won't open automatically** → Deferred; documented as a known MVP limitation. Users can still use "Reopen Editor With…" if we later add the viewer as a selectable (non-default) option for other patterns.
- **Very deep or wide sequence nesting could still make the tree UI sluggish even with virtualization** → Mitigate by flattening the visible tree to a virtualized list keyed by node path, and lazily rendering collapsed subtrees (don't expand-and-render off-screen children).
- **Malformed or non-conformant DICOM files could throw during parsing** → Mitigate by catching parse errors in `openCustomDocument`/`resolveCustomEditor` and rendering a clear "unable to parse" state in the webview instead of failing silently or crashing the extension host.
- **Data dictionary coverage gaps (private/vendor tags)** → Mitigate by falling back to "Private Tag" / "Unknown" labels rather than omitting the element, so the tree stays complete even for unrecognized tags.
- **Base64-encoding hex chunks over `postMessage` inflates size ~33%** → Acceptable since hex chunks are explicitly bounded/paginated per request, not the whole binary payload.

## Open Questions

- Exact scope of VR-aware formatting for MVP (e.g. how many VR types get bespoke formatting vs. a generic fallback) — to be resolved during implementation, informed by which VRs appear in representative sample files.
- Whether an `export` action (JSON/CSV/text) is worth adding in a follow-up change — out of scope for this MVP (proposal and specs cover copy only), noted here since the message protocol sketch leaves room for it.
