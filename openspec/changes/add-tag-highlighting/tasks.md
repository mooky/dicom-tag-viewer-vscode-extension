## 1. Protocol and shared types

- [ ] 1.1 Add `HighlightData` (`id`, `name`, `color`, `parentNoteKey`, `firstChildNoteKey`, `lastChildNoteKey`, `collapsed`) to `src/common/protocol.ts`
- [ ] 1.2 Extend the persisted/sent state shape (currently `NotesState`) to also carry `highlights: HighlightData[]`, keeping one shared `palette`
- [ ] 1.3 Add webview→host message types: `createHighlight`, `updateHighlight` (rename/recolor/extend/shrink/collapse toggle), `deleteHighlight`
- [ ] 1.4 Add host→webview message type (or extend `notesUpdate`) to push highlight state changes back down

## 2. Extension host persistence

- [ ] 2.1 Extend the stored JSON shape in `src/notesStore.ts` (`StoredNotesFile`) with a `highlights` array field, defaulting to `[]` when absent on load (backward-compatible with existing saved files)
- [ ] 2.2 Add load-time resolution: for each stored highlight, look up `firstChildNoteKey`/`lastChildNoteKey` among `parentNoteKey`'s current children to derive an index range; mark unresolved highlights the same way content drift is already surfaced
- [ ] 2.3 Add save-time serialization: persist highlights by tag-chain keys, not raw indices
- [ ] 2.4 Wire `src/dicomEditorProvider.ts` message handlers for `createHighlight` / `updateHighlight` / `deleteHighlight` through the existing `persistAndNotify` path

## 3. Selection and legality engine (webview)

- [ ] 3.1 Add an anchor/shift-click selection model in `src/webview/main.ts`, replacing/augmenting the current single `selectedPath`
- [ ] 3.2 Implement "nearest enclosing sequence" lookup and the terminal/non-terminal check (no SQ-typed descendant at any depth, across all items)
- [ ] 3.3 Implement range legality + auto-clamp: expand to full children when touching a non-terminal sequence; clamp to the anchor's own parent's last relevant sibling when anchor and target share no common parent
- [ ] 3.4 Implement span resolution from `HighlightData` (parent + first/last child key) to a concrete row index range for rendering

## 4. Create / edit / delete UI

- [ ] 4.1 Add a "Create Highlight…" context menu action on a valid selected range, reusing the note editor's color-swatch component plus a name field
- [ ] 4.2 Add "Add to Highlight" / "Remove from Highlight" context menu actions on rows adjacent to an existing highlight's edges, applying the same legality clamping as creation
- [ ] 4.3 Add click-to-reopen editing on a highlight's header row (prefilled name/color picker) for rename/recolor
- [ ] 4.4 Add a hover-revealed delete action on the highlight header row, dispatching `deleteHighlight`

## 5. Rendering

- [ ] 5.1 Add a new gutter column, separate from the existing note gutter, for highlight bars
- [ ] 5.2 Compute, per visible row, the ordered list of active highlights (creation order) and render one bar per entry
- [ ] 5.3 Render a faint full-row background wash from the most-recently-created active highlight on a row
- [ ] 5.4 Insert synthetic highlight-header rows into the flattened row list at each highlight's start, showing name, color chip, and (when collapsed) a member count
- [ ] 5.5 Implement per-highlight collapse: hide member rows when collapsed, independent of tag-tree expand state
- [ ] 5.6 Insert automatic spacing between adjacent, non-overlapping sibling highlights with no ungrouped row between them
- [ ] 5.7 Update `style.css` for the new gutter column, bar segments, header row, and hover/edit affordances (light + dark theme via existing VS Code CSS variables)

## 6. Search integration

- [ ] 6.1 Extend the existing search/filter logic so a highlight's header stays visible if any of its members match, showing only the matching subset beneath it

## 7. Highlights panel

- [ ] 7.1 Add a "Highlights" toggle button next to the existing "Notes" toggle in the toolbar
- [ ] 7.2 Add a Highlights panel listing all highlights in creation order (mirroring `renderNotesList`/`jumpToNote`)
- [ ] 7.3 Implement jump-to-highlight navigation: expand collapsed ancestors, scroll to the highlight's first member, select it

## 8. Verification

- [ ] 8.1 Manually verify against a sample `.dcm` file: create, extend, shrink, rename, recolor, collapse, and delete a highlight
- [ ] 8.2 Manually verify sequence legality: attempt a partial selection inside a non-terminal sequence (auto-expands) and inside a terminal sequence (stays partial)
- [ ] 8.3 Manually verify overlapping highlights render correctly (crossing and fully-contained cases) with correct bar order
- [ ] 8.4 Manually verify persistence: close and reopen the file, confirm highlights and their spans reload correctly
- [ ] 8.5 Manually verify content drift: modify the file's content and confirm the existing drift indication still surfaces correctly with highlights present
- [ ] 8.6 Run existing build/test/lint scripts and confirm no regressions
