## Why

Large DICOM dumps mix dozens of unrelated elements in tag order, making it hard to visually group the ones that belong to the same logical concern (e.g. "everything about the patient" or "the key measurement tags in this sequence") without re-reading tag numbers every time. Notes already let a user annotate one tag at a time, but there's no way to label and color-code a *span* of related tags at a glance.

## What Changes

- Add "highlighting": a user-created, named, colored span over a contiguous range of sibling tags (or sequence items), rendered as stacked bars in a new tree gutter column.
- Highlights are independent of each other and MAY overlap or fully contain one another; there is no enforced hierarchy.
- A highlight's span is restricted by sequence structure: it cannot partially cover a non-terminal sequence (one containing a nested SQ anywhere below it, at any depth) — touching any part forces the full set of children (Items or item-tags) to be included. Terminal sequences allow partial selection at any level.
- Selection is via click + shift-click over sibling rows, auto-clamping to the nearest legal range when the raw selection would violate the sequence rule or spans rows with no common parent.
- Highlights are created, renamed, recolored, extended/shrunk (from either edge only), collapsed independently of the tag tree's own expand state, and deleted (deletion removes only the labeled span — tags are never affected, and no promotion/reassignment happens to other highlights).
- A new "Highlights" panel mirrors the existing "Notes" panel: a flat, creation-ordered list with click-to-jump navigation.
- Highlight color swatches share the existing per-file note color palette (including custom colors), rather than maintaining a separate one.
- Highlights persist per file, keyed the same way notes are (SOPInstanceUID or content hash), and participate in the same content-drift detection.

## Capabilities

### New Capabilities
- `dicom-tag-highlighting`: creating, editing, rendering, navigating, and persisting named/colored highlight spans over the tag tree, including the sequence partial-selection rule.

### Modified Capabilities
- `dicom-tag-notes`: the per-file color palette requirement is broadened — the palette is now shared between notes and highlights (still scoped per-file, still never shared across files), rather than being exclusively a notes concept.

## Impact

- `src/webview/main.ts`: new selection/range model (anchor + shift-click, legality clamping), new gutter column and bar rendering, new highlight creation/edit UI (reusing the note swatch picker), new Highlights panel.
- `src/common/protocol.ts`: new message types for creating/editing/deleting highlights, new `HighlightData`/state shapes, extended notes-state payload to include the shared palette's new consumer.
- `src/notesStore.ts` (or a renamed/extended store): persist a `highlights` array alongside existing `notes`/`palette` in the same per-identity JSON file; resolve stored spans (`parentNoteKey` + first/last child `noteKey`) back to index ranges on load, tolerating drift the same way notes already do.
- `src/dicomEditorProvider.ts`: wire new webview↔host messages for highlight CRUD through the same persist-and-notify path used for notes.
- No changes to DICOM parsing (`src/parsing/**`) — highlighting is a pure overlay, like notes.
