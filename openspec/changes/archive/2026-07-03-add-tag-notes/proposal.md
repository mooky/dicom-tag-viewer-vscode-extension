## Why

Reviewers annotating a DICOM file today have no way to record findings against specific tags, or to visually correlate several tags that relate to the same finding, without leaving the tree view to keep notes elsewhere. Adding lightweight, color-coded notes directly on tags — with a visible signal when a collapsed branch hides annotated tags — keeps that context where it's needed.

## What Changes

- Add the ability to attach a single freeform note (text + color) to any tag in the tree.
- Persist notes per file, keyed primarily by the file's `SOPInstanceUID` (0008,0018) so notes survive copy/re-export, falling back to a whole-file hash when no `SOPInstanceUID` is present. Notes never modify the source `.dcm` file.
- Detect and surface (non-blocking) when a file's content no longer matches what it was when its notes were last saved.
- Add a per-file color palette: 6 pre-populated defaults plus user-added custom colors, persisted with that file's notes (not shared across files).
- Add a fixed-position left gutter in the tree view showing: a solid mark in a row's own note color, and — when a branch is collapsed — deduplicated ticks (capped, with overflow indication) for distinct note colors hidden beneath it.
- Add a per-file notes list showing every note in the current file (color, tag, note excerpt) that lets a user jump to any of them in the tree.

## Capabilities

### New Capabilities
- `dicom-tag-notes`: Attaching, editing, and persisting per-tag notes with freeform color; a per-file color palette; tree gutter indicators for a tag's own note and for notes buried in collapsed branches; and a notes list for navigating between them.

### Modified Capabilities
(none — existing tree rendering, search, detail pane, and copy behaviors are unchanged; note indicators are additive requirements owned by the new capability)

## Impact

- `src/common/protocol.ts`: new extension-host ↔ webview message types for loading, adding, editing, and clearing notes, and for palette updates.
- `src/dicomDocument.ts`: expose what's needed to derive a file's identity key (locate `SOPInstanceUID`, expose bytes for hashing).
- `src/dicomEditorProvider.ts`: wire note read/write requests to a new notes-storage module backed by `context.globalStorageUri`.
- `src/parsing/parseDicom.ts` / new module: derive a stable tag-id-chain identifier per node (distinct from the webview's presentation-order path) for use as the persisted note key.
- `src/webview/main.ts`: restructure tree row markup to add a fixed-width gutter column, render own-note and aggregate-descendant indicators, add a notes-list UI, and add note-editing UI to the detail pane.
- `src/webview/style.css`: gutter column and notes-list styling.
- New extension-host module for notes persistence (identity resolution, JSON read/write under global storage).
