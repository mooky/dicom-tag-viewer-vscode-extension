# dicom-tag-highlighting Specification

## Purpose

TBD - created by archiving change add-tag-highlighting. Update Purpose after archive.

## Requirements

### Requirement: Create a highlight over a sibling range
The webview SHALL let a user select a contiguous range of sibling rows — via clicking a row to set an anchor, then shift-clicking another row among its siblings — and create a named, colored highlight spanning that range, with an optional free-text note.

#### Scenario: Create a highlight over top-level tags
- **WHEN** a user clicks one top-level tag, shift-clicks another top-level tag, and confirms a name and color
- **THEN** a highlight is created spanning every sibling row between and including the two clicked rows

#### Scenario: Create a highlight with a note
- **WHEN** a user creates a highlight and enters text in its note field before confirming
- **THEN** the highlight is created with that note attached, viewable as a tooltip on its header row

#### Scenario: Create a highlight over sequence items
- **WHEN** a user shift-click-selects a range of Items within the same sequence and confirms a name and color
- **THEN** a highlight is created spanning exactly those items

### Requirement: Non-terminal sequences cannot be partially highlighted
The webview SHALL treat a sequence as non-terminal if it has an SQ-typed descendant at any depth beneath it, across all of its items. A highlight's span whose parent scope lies within a non-terminal sequence's subtree — whether choosing which items to include or which tags within one item to include — SHALL always include the full set of children at that level; a raw selection that would only partially cover it SHALL be expanded to the full set automatically rather than rejected.

#### Scenario: Selecting inside a non-terminal sequence's items
- **WHEN** a user's selection touches only some tags of one item belonging to a sequence that has a nested SQ anywhere below it
- **THEN** the resulting highlight's span automatically expands to include all tags of that item

#### Scenario: Selecting some items of a non-terminal sequence
- **WHEN** a user's selection touches only some items of a sequence that has a nested SQ anywhere below it
- **THEN** the resulting highlight's span automatically expands to include all items of that sequence

#### Scenario: Terminal sequence allows partial selection
- **WHEN** a user selects a subset of one item's tags, or a subset of a sequence's items, and no SQ-typed element exists anywhere beneath that sequence
- **THEN** the highlight is created over exactly the selected subset, without expansion

### Requirement: Selection clamps to the nearest legal range
The webview SHALL, when an in-progress shift-click selection would not form a legal highlight span, automatically clamp the selection rather than allow an invalid range or block the interaction. If the anchor and the shift-click target share no common parent, the selection SHALL clamp to the anchor's own sibling range, stopping at whichever of the anchor's siblings the target is nested under (not merely the closest one in document order) — e.g. shift-clicking deep inside a later sequence stops the selection at that sequence, rather than extending to the last top-level sibling in the document. If the target's branch cannot be determined to nest under any of the anchor's own siblings, the selection clamps to the first or last sibling under the anchor's parent, whichever is closer to the target in document order.

#### Scenario: Shift-click target has no common parent with the anchor
- **WHEN** a user shift-clicks a row that is nested several levels inside a different top-level sequence than the current anchor
- **THEN** the selection clamps to the anchor's own sibling range, extending only as far as the sequence the target is nested under — not past it to the end of the document

### Requirement: Highlights may overlap without hierarchy
The webview SHALL allow two highlights' spans to overlap arbitrarily — crossing, fully containing one another, or disjoint — without requiring one to contain or be disjoint from the other. Creating or editing a highlight SHALL NOT be blocked or altered by another highlight's existing span.

#### Scenario: Create a highlight crossing another's boundary
- **WHEN** a user creates a highlight whose span partially overlaps an existing highlight's span, with neither containing the other
- **THEN** both highlights persist independently, each covering their own original span

#### Scenario: Create a highlight fully containing another
- **WHEN** a user creates a highlight whose span fully contains an existing highlight's span
- **THEN** both highlights persist independently as separate entries

### Requirement: Extend or shrink a highlight from its edges
The webview SHALL let a user extend an existing highlight by adding the sibling immediately adjacent to either end of its span, or shrink it by removing its first or last member. Extending SHALL be subject to the same sequence-rule clamping as initial creation. The webview SHALL NOT offer removing a member from the middle of a highlight's span.

#### Scenario: Extend a highlight to an adjacent sibling
- **WHEN** a user adds the sibling row immediately following a highlight's current last member
- **THEN** the highlight's span grows to include that sibling

#### Scenario: Shrink a highlight from an edge
- **WHEN** a user removes a highlight's current first or last member
- **THEN** the highlight's span shrinks by that one member, and the rest of the span is unaffected

#### Scenario: Extending into a non-terminal sequence forces full inclusion
- **WHEN** a user extends a highlight's span such that it would newly touch part of a non-terminal sequence's children
- **THEN** the extension automatically expands to include the full set of that sequence's children at that level, per the sequence rule

### Requirement: Rename or recolor an existing highlight
The webview SHALL let a user reopen a highlight's name/color/note editor, pre-filled with its current values, by clicking its header row, and save changes to its name, color, and note without affecting its span or membership.

#### Scenario: Rename a highlight
- **WHEN** a user clicks an existing highlight's header, changes its name, and saves
- **THEN** the highlight's displayed name updates and its span is unchanged

#### Scenario: Recolor a highlight
- **WHEN** a user clicks an existing highlight's header, selects a different color, and saves
- **THEN** the highlight's bars and header update to the new color and its span is unchanged

#### Scenario: Edit a highlight's note
- **WHEN** a user clicks an existing highlight's header, changes its note text, and saves
- **THEN** the highlight's note updates and its name, color, and span are unchanged

### Requirement: Collapse a highlight independently of the tag tree
Each highlight SHALL have its own collapsed/expanded state, independent of the underlying tag tree's own expand/collapse state. Collapsing a highlight SHALL hide all of its member rows and show a count of its members on its header row.

#### Scenario: Collapse a highlight
- **WHEN** a user collapses a highlight whose members are otherwise expanded in the tag tree
- **THEN** the highlight's member rows are hidden and its header shows a count of its members

#### Scenario: Collapsing one highlight interrupts another's visible bars
- **WHEN** a highlight is collapsed and a different highlight's span partially overlaps the collapsed rows
- **THEN** the overlapping highlight's bars are only visible on the rows that remain rendered, with no special handling required for the hidden portion

### Requirement: Delete a highlight without affecting tags or other highlights
The webview SHALL let a user delete a highlight via a hover-revealed action on its header row. Deleting a highlight SHALL remove only that highlight; the underlying DICOM tags SHALL remain unchanged, and any other highlight whose span overlapped the deleted one SHALL be unaffected.

#### Scenario: Delete a highlight
- **WHEN** a user deletes an existing highlight
- **THEN** that highlight no longer appears, its former member tags remain in the tree exactly as before, and any other highlight overlapping those tags is unaffected

### Requirement: Tree gutter renders stacked highlight bars
The webview SHALL display a gutter column, separate from the existing note gutter, showing one solid bar per highlight active on a row, ordered left to right by the highlights' creation order (oldest leftmost).

#### Scenario: One highlight active on a row
- **WHEN** a row belongs to exactly one highlight
- **THEN** its gutter shows a single bar in that highlight's color

#### Scenario: Multiple highlights active on a row
- **WHEN** a row belongs to two or more highlights, whether nested or crossing
- **THEN** its gutter shows one bar per active highlight, ordered left to right by creation order

### Requirement: Automatic spacing between adjacent sibling highlights
The webview SHALL insert a small fixed visual gap whenever one highlight's span ends and a different, non-overlapping sibling highlight's span begins immediately after it, so their header labels do not visually collide.

#### Scenario: Two highlights are back-to-back with no ungrouped row between them
- **WHEN** one highlight's last member row is immediately followed by a different highlight's first member row
- **THEN** a visual gap is rendered between them

### Requirement: Highlight headers respect search filtering
When the tree's search filter is active, the webview SHALL keep a highlight's header visible if at least one of its members matches the filter, showing only the matching subset of its members beneath it.

#### Scenario: Some members match the search query
- **WHEN** a search query matches only some of a highlight's members
- **THEN** the highlight's header remains visible and only the matching members are shown beneath it

#### Scenario: No members match the search query
- **WHEN** a search query matches none of a highlight's members
- **THEN** the highlight's header is not shown

### Requirement: Highlights panel lists and navigates to highlights
The webview SHALL provide a "Highlights" panel, toggled the same way as the existing Notes panel, listing every highlight in the current file in creation order, and SHALL let a user select an entry to navigate the tree to that highlight's span — expanding any collapsed ancestors as needed, scrolling it into view.

#### Scenario: Highlights panel reflects current file's highlights
- **WHEN** a file with existing highlights is open
- **THEN** the Highlights panel shows one entry per highlight, in creation order

#### Scenario: Jump to a highlight from the panel
- **WHEN** a user selects an entry in the Highlights panel for a highlight nested inside one or more collapsed branches
- **THEN** the necessary ancestor branches are expanded and the tree scrolls to the start of that highlight's span

### Requirement: Highlights persist per file with drift tolerance
The extension host SHALL persist highlights the same way it persists notes: keyed by the file's identity (SOPInstanceUID, or a content-hash fallback), stored as each highlight's parent tag-chain plus its first and last member's tag-chain rather than raw indices, so a highlight's span remains attached to the correct tags even when unrelated elements elsewhere in the file shift presentation order. The source file SHALL NOT be modified.

#### Scenario: Reopen a file with preserved highlights
- **WHEN** a file with saved highlights is reopened and its identity still matches
- **THEN** its highlights are loaded and rendered in their original spans

#### Scenario: Unrelated structural change elsewhere in the file
- **WHEN** an unrelated tag is added or removed elsewhere in the dataset, shifting the sorted order of top-level elements, but a highlight's own member tags are unaffected
- **THEN** the highlight's span still covers the same tags, not whatever tags now occupy the same tree positions

#### Scenario: Saving a highlight never writes to the source file
- **WHEN** a user creates, edits, or deletes a highlight
- **THEN** the bytes of the open `.dcm` file on disk remain unchanged
