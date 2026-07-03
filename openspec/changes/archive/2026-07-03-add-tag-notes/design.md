## Context

The DICOM Tag Viewer is a `CustomReadonlyEditorProvider` (`src/dicomEditorProvider.ts`): the extension host parses a `.dcm` file once (`src/parsing/parseDicom.ts`) into a `TreeNode[]` model, sends it to the webview, and the webview renders a virtualized, expandable tree (`src/webview/main.ts`) plus a detail pane for the selected row. There is currently no write path anywhere in the extension — the document is never mutated, and nothing is persisted.

Notes introduce the extension's first persistence concern. The source `.dcm` file must stay untouched: these files are frequently exported from a PACS/archive onto read-only or network-mounted media, and mutating them (or writing a sidecar next to them) is not reliable or appropriate. Notes therefore need their own storage, entirely outside the document.

Two properties of the existing code materially shape this design:
- `buildNodes()` in `parseDicom.ts` derives top-level element order via `Object.keys(dataSet.elements).sort()` — deterministic for one exact byte layout, not guaranteed stable across two files that are "the same" by any looser notion of identity.
- The webview's row `path` (e.g. `"0.3.1"`, built in `flatten()`/`flattenFiltered()`) is a presentation-order index recomputed on every render pass; it is not, and must not become, a persisted identifier.

## Goals / Non-Goals

**Goals:**
- Let a user attach one freeform-colored note to any tag in the currently open file.
- Make it visually obvious, even with a branch collapsed, that notes exist beneath it.
- Let a user enumerate and jump to every note in the current file.
- Never modify the source `.dcm` file; keep the editor read-only.
- Keep notes attached to the correct tag even if the file is later re-exported/re-compressed, as long as it's recognizably "the same DICOM instance."

**Non-Goals:**
- Cross-file note or palette correlation. Colors and their meaning are defined per file only.
- A native VS Code sidebar contribution (e.g. `TreeDataProvider`) for notes — the notes list lives inside the existing webview.
- Multiple notes per tag (threading).
- Full-text search over note content (compatible future addition, not built now).
- Expand-to-reveal or cycling behavior on gutter clicks.

## Decisions

### 1. File identity: SOPInstanceUID primary, whole-file hash fallback
Notes are persisted under a per-file store keyed by identity. Two options were considered:
- **Whole-file SHA-256 hash of the bytes.** Safe (any content difference is a different key) but brittle — a re-export, re-compression, or anonymization pass that doesn't touch tag content still orphans every note.
- **`SOPInstanceUID` (tag 0008,0018).** DICOM's own instance identity; survives copies/re-exports/re-compression as long as the UID is preserved, which is the common case. Risk: a tool that edits tag values while preserving the UID could leave a note describing now-stale content with no visible sign.

**Decision:** use `SOPInstanceUID` as the primary key. When a parseable file has no `SOPInstanceUID` (nonstandard/hand-assembled files), fall back to a whole-file SHA-256 hash for that file only, rather than disabling notes entirely.

To partially mitigate the staleness risk accepted above, also persist a whole-file SHA-256 **as a diagnostic field, not part of the lookup key**, captured whenever notes are saved. On load, if the live file's hash doesn't match the stored diagnostic hash, show a non-blocking banner ("file content differs from when these notes were saved"). This never blocks or hides notes — it only makes an accepted trust assumption visible.

### 2. Storage location: extension global storage, not a sidecar file
Considered a `<file>.dcm.notes.json` sidecar next to the source file (shareable via git, visible in Explorer) versus `context.globalStorageUri` (always writable, invisible to teammates without an explicit export feature).

**Decision:** `context.globalStorageUri`, one JSON document per identity key. Source files are frequently read-only/archival; a sidecar would fail to write in exactly the scenario notes are most useful. Global (not workspace) storage, because `.dcm` files are typically opened ad hoc rather than living inside a project tied to one workspace.

### 3. Per-note key: tag-id chain, not the webview's row path
The webview already computes a row `path` like `"0.3.1"` for expand/collapse state and virtualization math. Using that same value as the persisted note key was rejected: it's an index into whatever order `Object.keys(dataSet.elements).sort()` produced for *this exact byte layout*. Since identity (Decision 1) can match across two files with slightly different byte layouts, an index-based key could silently reattach a note to the wrong tag after a re-export — worse than a stale note, because nothing indicates the mismatch.

**Decision:** persisted note keys are a tag-id chain built from dictionary tags and, where applicable, sequence item index — e.g. `"(0008,1140)>Item 1>(0008,1150)"`. Within one dataset/item scope, tag keys are unique (they come from a plain JS object), so this chain is unambiguous without needing sibling-position information, and it's stable across byte-layout changes elsewhere in the file. The webview's index-based `path` continues to exist, unchanged, purely as a UI concern (expand state, scrolling); a lookup translates between the two only when reading or writing a note.

### 4. Color model: freeform hex, no named categories
Considered named categories (a small set of user-defined labels, each with a fixed color) versus a bare color value per note. Given colors don't need to correlate across files, categories would add management UI (create/rename/delete a category) for a benefit — reusable semantic meaning — that only matters across files or long timeframes.

**Decision:** each note stores a literal hex color. "Relatedness" is entirely "the user picked the same swatch," which is sufficient for within-file correlation.

### 5. Palette: per-file, 6 defaults + custom, not global
Considered a shared `globalState` palette (grows once, available in the picker for every file) versus a palette scoped to and persisted inside each file's own note store.

**Decision:** per-file. The prompt establishing this ("colors do not need to correlate across files... colored notes are only locally defined") rules out a shared list — a custom color added while annotating file A should not appear, or imply any relationship, when annotating file B. Each file's note store carries its own palette array, seeded with 6 fixed defaults, appended to when a custom color is added for that file.

### 6. Tree gutter: fixed-position column outside depth indentation
Today, `renderRow()` applies `paddingLeft: depth*16+4` directly to the row element, so the caret and label shift right with nesting depth. A gutter that's meant to be scannable top-to-bottom (like VS Code's own editor gutter — line numbers, breakpoints, git decorations) must stay at a fixed `x` regardless of depth.

**Decision:** restructure row markup from `[row with paddingLeft][caret][label]` to `[gutter: fixed width][indent-spacer: depth*16][caret][label]`, moving the depth offset off the row itself and onto an inner spacer element. The gutter shows:
- a solid mark in the note's own color, when this row has a note;
- when the row is collapsed and has descendant notes, small ticks for the **deduplicated set of distinct descendant colors**, capped at 3 with a "+N" overflow glyph.

The descendant color set is precomputed once per notes/model change via a single post-order traversal (each node's subtree color set = its own color, if any, unioned with its children's subtree color sets), not recomputed during scroll. This matters because rows are virtualized (`renderVisibleSlice()` runs on every scroll frame) — per-row lookups during scroll must be O(1) map reads, not tree walks.

Gutter clicks are decorative only in this design (see Decision 7 for why that's sufficient).

### 7. Notes list ships in v1, gutter clicks stay inert
Considered making gutter marks interactive (click to expand-and-reveal a buried note, cycling through matches) versus a dedicated notes list. Expand-to-reveal was rejected because it mutates expand state as a side effect of what looks like a "peek," and can force-open a very large collapsed sequence just to surface one note.

**Decision:** build a per-file notes list into the existing webview (integrated into the tree/detail layout, not a native VS Code sidebar tree view) showing every note in the current file — swatch, tag, first line of text — with click-to-jump (expanding whatever ancestors are needed, scrolling to, and selecting that row). This is the actual mechanism for "correlate related notes"; the gutter is only an ambient signal that something is there. Because the notes list makes every note reachable regardless of nesting or the gutter's overflow cap, gutter marks can stay purely decorative without losing functionality.

## Risks / Trade-offs

- **[Risk]** A tag's value changes while its file's `SOPInstanceUID` is preserved → an existing note may now describe stale content, with no automatic detection. **Mitigation:** the diagnostic whole-file-hash comparison (Decision 1) surfaces *some* form of this drift via a non-blocking banner, though it cannot pinpoint which note is affected.
- **[Risk]** A file with no `SOPInstanceUID` falls back to a whole-file hash, which is brittle to any later edit. **Mitigation:** accepted as a rare-path trade-off; notes for such files are inherently less durable, which is disclosed via the same diagnostic banner mechanism.
- **[Risk]** Gutter overflow (more than 3 distinct descendant colors buried in one collapsed branch) hides information at a glance. **Mitigation:** the notes list (Decision 7) always has the full enumeration; nothing is actually lost, only deferred to a second look.
- **[Trade-off]** Per-file palettes mean no cross-file color reuse convenience — adding a custom color in one file doesn't make it available in another. This is the explicit, intended behavior per the "locally defined" requirement, not an oversight.

## Migration Plan

No migration required — this is new capability with no prior persisted state. Extension global storage is created lazily on first note write. No changes to the document model, editor registration, or existing message types beyond additive ones.

## Open Questions

- Whether to extend the existing search box (`nodeMatches` in `src/webview/main.ts`) to also match note text — floated during design discussion, not committed to this change's scope.
