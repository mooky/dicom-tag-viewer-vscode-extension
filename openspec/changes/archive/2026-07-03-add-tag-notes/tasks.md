## 1. Protocol and identity groundwork

- [x] 1.1 In `src/parsing/parseDicom.ts` (or a new sibling module), add a function to compute the stable tag-id chain key for a node (e.g. `"(0008,1140)>Item 1>(0008,1150)"`) built from dictionary tags and sequence item index, independent of the webview's presentation-order path.
- [x] 1.2 Add a function to locate the top-level `SOPInstanceUID` (0008,0018) value from a parsed dataset, returning `undefined` when absent.
- [x] 1.3 Add a whole-file SHA-256 hashing utility for the extension host (Node `crypto`), used both as the no-UID fallback identity and as the diagnostic drift-detection hash.
- [x] 1.4 Extend `src/common/protocol.ts` with new message types: ext→webview `notes` (or folded into `model`) carrying the current file's notes, palette, and drift-flag; webview→ext `setNote`, `clearNote`, `addPaletteColor`.

## 2. Extension host: notes persistence

- [x] 2.1 Add a notes-storage module that resolves a file's identity key (SOPInstanceUID, else content hash) and reads/writes a per-key JSON document under `context.globalStorageUri` (notes map keyed by tag-id chain, palette array, diagnostic content hash).
- [x] 2.2 Extend `src/dicomDocument.ts` (or the notes-storage module, given the document) to expose the raw bytes and parsed elements needed to derive the identity key and drift hash.
- [x] 2.3 On document open, compute the identity key and drift hash; load existing notes/palette if present, or seed the 6 default palette colors if not.
- [x] 2.4 In `src/dicomEditorProvider.ts`, send notes + palette + drift flag to the webview alongside the initial model, and handle `setNote`/`clearNote`/`addPaletteColor` messages by updating the notes-storage module and persisting to disk.

## 3. Webview: note data and editor UI

- [x] 3.1 In `src/webview/main.ts`, store the received notes (keyed by tag-id chain) and palette in memory, and add a lookup from a row's `TreeNode` to its tag-id chain so notes can be matched to rows.
- [x] 3.2 Add a note section to the `#detail` pane: current note text/color (if any), a swatch picker seeded from the palette plus an "add custom color" control, and Save/Delete actions that post `setNote`/`clearNote`.
- [x] 3.3 Wire `addPaletteColor` so a newly added custom color is immediately available in the picker and persisted for this file.
- [x] 3.4 Render the non-blocking content-drift banner when the extension host reports the file's current hash doesn't match the recorded one.

## 4. Webview: tree gutter

- [x] 4.1 Restructure `renderRow()` in `src/webview/main.ts` so depth indentation moves from the row's `paddingLeft` onto an inner indent-spacer element, freeing a fixed-width gutter column at a constant horizontal position for every row.
- [x] 4.2 Add a precomputed map from path (or tag-id chain) to "own note color" and, separately, a post-order-computed map to "distinct descendant note colors," recomputed once whenever notes or the model change (not during scroll).
- [x] 4.3 Render a solid gutter mark using the own-note-color map for any row with a note.
- [x] 4.4 Render aggregate ticks (capped at 3, with an overflow glyph beyond that) in the gutter for collapsed rows using the descendant-colors map; suppress aggregate ticks once a row is expanded.
- [x] 4.5 Add gutter styling in `src/webview/style.css` (fixed column width, mark/tick/overflow appearance, light/dark-theme-safe using VS Code CSS variables where applicable).

## 5. Webview: notes list

- [x] 5.1 Add a notes-list UI element (e.g. a toggle button revealing a panel/strip) listing every current note: swatch, tag, first line of text.
- [x] 5.2 Implement click-to-jump: expand any collapsed ancestors of the target row, scroll it into view, and select it, reusing existing `expanded`/`selectedPath` state and `recomputeRowsAndRender()`.
- [x] 5.3 Keep the notes list in sync when a note is added, edited, or deleted (re-render on the same state updates that drive gutter recomputation).

## 6. Verification

- [x] 6.1 Manually verify against `sample-files/valid-sample.dcm`: add notes at top level and inside a nested sequence item, confirm gutter marks and notes-list entries appear correctly, confirm collapse/expand aggregate behavior including the 3-color overflow case.
- [x] 6.2 Verify persistence: close and reopen the same file, confirm notes, custom palette colors, and no drift banner.
- [x] 6.3 Verify drift detection: after saving notes, modify a copy of the file's bytes without changing `SOPInstanceUID` (or simulate), reopen, confirm the non-blocking drift banner appears and notes still load.
- [x] 6.4 Verify the no-`SOPInstanceUID` fallback path using a crafted or existing fixture lacking that tag, confirming notes still persist via content hash.
- [x] 6.5 Verify palette isolation: add a custom color in one sample file, confirm it does not appear when opening a different sample file.
- [x] 6.6 Confirm the source `.dcm` file's bytes are unchanged on disk after adding/editing/deleting notes.
- [x] 6.7 Add a real, distinct `(0008,0018) SOPInstanceUID` to each fixture in `sample-files/generate-samples.js` (previously only the file-meta group's Media Storage SOP Instance UID was set, and both samples shared the same value) so the primary identity path — and palette isolation across two files — is actually exercisable in manual verification.
