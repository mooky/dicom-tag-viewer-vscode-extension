## Context

The webview ([src/webview/main.ts](../../../src/webview/main.ts)) renders the parsed tag tree as a flat, virtualized row list (`rows: Row[]`) built by flattening nested `TreeNode[]`. Each node carries a stable `noteKey` — a tag-id chain (e.g. `(0008,1140)>Item 1>(0008,1150)`) rather than an index path — so per-tag annotations survive re-parses of the same file even when unrelated elements shift presentation order. Notes (`NotesStore`) already use this: a `Record<noteKey, NoteData>` persisted per file identity (SOPInstanceUID, or a content hash fallback), with drift detection when the file's content hash no longer matches what was recorded at save time.

Highlighting reuses this exact foundation — same identity/persistence/drift model, same shared color palette — but adds a second overlay structure: named, colored **spans** over ranges of sibling rows, rather than single-tag annotations.

## Goals / Non-Goals

**Goals:**
- Let a user label a contiguous range of sibling tags (or sequence items) as a named, colored highlight.
- Support arbitrary overlap between highlights (crossing, nested, or disjoint) with no enforced hierarchy.
- Enforce the DICOM-specific sequence rule: a non-terminal sequence (one with a nested SQ anywhere below it) can never be partially covered by a single highlight's span — only fully included, at every level (Items list or item-tags).
- Render highlights in a virtualized list without materializing off-screen DOM.
- Persist highlights the same way notes are persisted: per-file, drift-tolerant, surviving reordering elsewhere in the file.

**Non-Goals:**
- No reordering of tags to make non-contiguous concepts visually adjacent — a highlight's members are always in document order.
- No cross-parent spans — a single highlight is always "children i..j of one parent"; grouping tags from different parents requires separate (possibly overlapping) highlights.
- No merge/split UI for highlights beyond edge-only extend/shrink — arbitrary mid-range add/remove is out of scope.
- No change to DICOM parsing or the underlying element model.

## Decisions

### Highlights are a flat list, not a tree
**Decision:** A highlight is `{ id, name, color, parentNoteKey, firstChildNoteKey, lastChildNoteKey, collapsed }`, stored in a flat array. There is no parent/child relationship between highlights themselves — overlap (including full containment) is just a rendering-time computation over row membership, not a stored relationship.
**Alternative considered:** A strict tree (each highlight optionally nested inside one parent highlight, spans required to nest-or-be-disjoint). Rejected once overlap without containment was explicitly allowed — a tree can't represent two crossing ranges, and the flat model is also what makes deletion trivial (removing one entry has no effect on any other highlight, no promotion/reparenting logic needed).

### Span = structural sibling range, not visual row range
**Decision:** A highlight's span is anchored to `(parentNoteKey, firstChildNoteKey, lastChildNoteKey)` and resolved to an index range among that parent's *current* children at render time. This is stable across expand/collapse and search-filter state, and tolerates the file being re-parsed (same drift model as notes: if either boundary key can't be found among the parent's children, the highlight is flagged as drifted, same as a note would be).
**Alternative considered:** Defining the span as "whatever rows were visually between two clicks in the flattened list." Rejected — ambiguous the moment a sequence inside the range gets collapsed or a search filter changes what's flattened.

### Sequence legality: any nested SQ, at any depth, disqualifies "terminal"
**Decision:** Walking up from a highlight's parent scope to the nearest enclosing sequence: if that sequence has no SQ-typed descendant anywhere below it (checked across all items, all levels), it's terminal and partial spans are legal at any level under it (Items list or one item's tags). If it has any nested SQ anywhere below, it's non-terminal, and *any* span whose parent scope lies within its subtree is forced to the full set of children at that level — this applies uniformly whether the span is choosing which Items to include or which tags within one Item to include.
**Alternative considered:** Evaluating "terminal" only by an item's direct children (ignoring further nesting). Rejected as inconsistent — a sequence three levels removed from a nested SQ would incorrectly permit partial selection right up until the level where the nesting becomes visible.

### Selection: anchor + shift-click, illegal reach auto-clamps
**Decision:** Clicking a row sets an anchor; shift-clicking another row extends to the sibling range between them. If the raw target would break the sequence rule, the range silently expands to the smallest legal superset (e.g. touching one child of a non-terminal sequence expands to all of that sequence's children). If the anchor and shift-click target share no common parent at all, the range clamps to the anchor's own sibling range, stopping at whichever of the anchor's own siblings the target is nested under — not at whatever sibling happens to be numerically/positionally closest, and never past that sibling to the rest of the document. Only when the target's branch can't be resolved under any of the anchor's siblings does it fall back to clamping to the first/last sibling in the target's direction.
**Alternative considered:** Clamping to the last sibling under the anchor's parent whenever the target lies later in document order (and first sibling when earlier), regardless of which sibling actually contains the target. Implemented first, but this overselects badly in practice — e.g. anchoring on a shallow top-level tag and shift-clicking deep inside a *later* sequence selected all the way to the final top-level element, including unrelated tags far past the sequence the user was actually reaching into.
**Alternative considered:** Rejecting illegal ranges with an inline error, requiring the user to manually adjust. Rejected in favor of the friendlier, self-correcting clamp — there's no legal state the tool could be nudging the user toward other than the clamped one, so surfacing an error adds a step without adding information.

### Rendering: left-edge guide bars, not full-row translucent fill
**Decision:** A dedicated gutter column (separate from the existing 22px note gutter) renders one solid bar per highlight active on that row. Each highlight is assigned a stable lane (column position) for its entire on-screen span — computed once per render via the same greedy interval-graph-coloring approach used for git-log lane assignment (sort spans by first active row, reuse the lowest-numbered free lane, allocate a new one only when none are free) — so a highlight's bar always renders in the same column across every row it touches, with empty (blank) cells for lanes not active on a given row. The most-specific (smallest structural range) active highlight on a row also contributes a faint full-row background wash (~12% alpha) for extra legibility.
**Alternative considered:** Ordering bars left-to-right by creation order, recomputed per row from just that row's active subset. Rejected after implementation showed it staggers — a highlight's bar shifts columns from row to row depending on which *other* highlights happen to be active on that particular row, since compacting a filtered list drops gaps. Fixed-lane assignment (unaffected by what else is active on a given row) reads as solid, continuous columns instead, matching how git history graphs keep a branch in one column for its lifetime.
**Alternative considered (wash color):** Most-recently-created active highlight. Rejected — recency has no relationship to visual hierarchy; readers expect the narrowest/most-specific highlight (typically the "innermost" label for that row) to win the wash, not whichever was made last.
**Alternative considered:** Full-row translucent fill per active highlight, stacked as compositing layers so nesting reads as a deeper blended tint. Prototyped and compared directly (see conversation-linked mockup); rejected because two overlapping accent hues visibly average into a third, muddier color, which gets worse (not better) once arbitrary overlap — rather than clean nesting — became a supported case. Bars keep every highlight's hue legible regardless of how many others it overlaps with.

### Editing: edges only, no mid-range add/remove
**Decision:** An existing highlight can be extended by adding the sibling immediately adjacent to either end (`Add to Highlight`, subject to the same sequence-rule clamping as creation), or shrunk by dropping its first or last member (`Remove from Highlight`). There is no operation to remove a middle member.
**Alternative considered:** Arbitrary add/remove anywhere in the span, auto-splitting into two highlights when a middle member is removed. Rejected — doubles the highlight count silently and needs its own naming prompt for the new piece, for a use case (removing one tag from the middle of a labeled span) that's adequately served by delete-and-recreate.

### Independent collapse state per highlight
**Decision:** Each highlight has its own `collapsed: boolean`, orthogonal to the tag tree's own expand/collapse state. Collapsing a highlight hides all of its member rows and shows a compact tag count on its header row. Because this hides rows structurally, any *other* highlight whose span partially overlaps the collapsed range is simply interrupted for those rows while collapsed — there is no special-casing required, it falls out of "collapse hides rows."

### Deletion has no promotion
**Decision:** Deleting a highlight removes exactly that one entry from the flat list. No other highlight is affected, even if its span overlapped the deleted one's. Tags are never touched — consistent with the flat, non-hierarchical model above.

### Shared color palette with notes
**Decision:** Highlights use the same per-file palette (`DEFAULT_PALETTE` + custom colors) already persisted for notes. One `palette` array in the stored JSON, one "add custom color" flow, reused by both the note editor's swatches and the highlight creation/edit picker.
**Alternative considered:** A second, independent palette for highlights. Rejected as unnecessary isolation — recoloring for one concern has no reason to be walled off from the other within the same file, and it avoids a second persisted array and a second "add custom color" UI.

## Risks / Trade-offs

- **[Risk] A row can now show note markers, descendant-note ticks, *and* a stack of highlight bars simultaneously, in adjacent gutter columns.** → Mitigation: dedicated column per concern (kept separate rather than merged into the existing 22px note gutter), keeping each legible at the cost of slightly wider rows.
- **[Risk] Arbitrary overlap means a row's highlight-bar stack can grow unbounded in pathological cases (many highlights covering the same tag).** → Mitigation: same overflow-indicator pattern the note gutter already uses for >3 descendant colors can be reused for the bar column if this proves common in practice; not needed for initial implementation given expected usage (a handful of labeled spans per file).
- **[Risk] Resolving a stored span's `firstChildNoteKey`/`lastChildNoteKey` against a re-parsed file's current children is an O(children) scan per highlight per load.** → Mitigation: negligible in practice (children counts are small — dozens, not thousands — and this happens once per file load, not per render).

## Migration Plan

Additive only — no existing persisted data changes shape in an incompatible way. The stored per-identity JSON gains a new `highlights` array alongside the existing `notes`/`palette` fields; files with no `highlights` key simply load with an empty highlight set. No rollback concerns beyond reverting the extension version.

## Open Questions

- Whether the faint full-row wash tied to the most-recently-created active highlight (see Rendering decision) is worth keeping once seen in the actual tree with real data, versus dropping it for pure bars — flagged during design as a minor call, not confirmed against a live mockup of the final gutter layout (bars column + existing note gutter together).
