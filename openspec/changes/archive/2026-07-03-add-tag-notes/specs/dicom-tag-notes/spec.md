## ADDED Requirements

### Requirement: Attach a note to a tag
The webview SHALL let a user attach a single note, consisting of freeform text and a color, to any tag in the tree. A tag SHALL have at most one note at a time; saving a new note for an already-noted tag SHALL replace the existing one.

#### Scenario: Add a note to an unnoted tag
- **WHEN** a user selects a tag with no existing note and saves note text with a chosen color
- **THEN** that tag is associated with the saved text and color

#### Scenario: Edit an existing note
- **WHEN** a user selects a tag that already has a note and saves different text or a different color
- **THEN** the previous note content is replaced, not duplicated

#### Scenario: Delete a note
- **WHEN** a user clears a tag's note
- **THEN** the tag has no note and no longer contributes to gutter indicators or the notes list

### Requirement: Notes persist per file, keyed by DICOM instance identity
The extension host SHALL persist notes outside the source `.dcm` file, associated with the file's `SOPInstanceUID` (tag 0008,0018) when present. When a file has no `SOPInstanceUID`, the extension host SHALL fall back to a whole-file content hash as the identity key. The source file SHALL NOT be modified.

#### Scenario: Reopen a file with a preserved SOPInstanceUID
- **WHEN** a file previously annotated is reopened, and its current bytes still contain the same `SOPInstanceUID` as when notes were saved (even if other bytes differ)
- **THEN** its previously saved notes are loaded and displayed

#### Scenario: Open a parseable file with no SOPInstanceUID
- **WHEN** a `.dcm` file parses successfully but contains no `SOPInstanceUID` element
- **THEN** notes for that file are stored and retrieved using a whole-file content hash instead

#### Scenario: Saving a note never writes to the source file
- **WHEN** a user adds, edits, or deletes a note
- **THEN** the bytes of the open `.dcm` file on disk remain unchanged

### Requirement: Note identity survives unrelated structural changes
The extension host SHALL key each individual note by a tag-id chain derived from dictionary tag identifiers (and sequence item index, where applicable), not by the tree's presentation-order position, so that a note remains attached to the correct tag even when unrelated elements elsewhere in the file shift that position.

#### Scenario: An unrelated element is added elsewhere in the file
- **WHEN** a file's SOPInstanceUID is unchanged but an unrelated tag has been added or removed elsewhere in the dataset, shifting the sorted order of top-level elements
- **THEN** previously saved notes still attach to their original tags, not to whatever tag now occupies the same tree position

### Requirement: Detect and surface content drift for a matched file
The extension host SHALL record a whole-file content hash whenever notes are saved for a file, separate from the identity key used for lookup. When a file's notes are loaded, if the file's current content hash does not match the recorded hash, the webview SHALL display a non-blocking indication that the file's content differs from when its notes were saved.

#### Scenario: File content changed since notes were last saved
- **WHEN** a file is opened whose SOPInstanceUID matches a stored note set, but whose current content hash does not match the hash recorded at last save
- **THEN** the notes still load and display, and the webview shows a non-blocking indication that the file's content has changed since the notes were saved

#### Scenario: File content unchanged since notes were last saved
- **WHEN** a file is opened whose current content hash matches the hash recorded at last save
- **THEN** no drift indication is shown

### Requirement: Per-file color palette
The webview SHALL offer a color palette for notes, pre-populated with 6 default colors, and SHALL let a user add custom colors beyond the defaults. The palette, including any custom colors added, SHALL be persisted as part of that file's own note data and SHALL NOT be shared with or applied to any other file.

#### Scenario: Default palette available on a file with no prior notes
- **WHEN** a user opens a file with no existing notes and begins adding a note
- **THEN** the 6 default colors are offered as swatch choices

#### Scenario: Custom color persists for the same file
- **WHEN** a user adds a custom color while annotating a file, then closes and reopens that same file
- **THEN** the custom color is still offered as a swatch choice for that file

#### Scenario: Custom color does not appear in a different file
- **WHEN** a user adds a custom color while annotating one file, then opens a different file
- **THEN** the other file's palette shows only its own defaults and any custom colors previously added specifically to it

### Requirement: Tree gutter indicates a tag's own note
The tree view SHALL display a fixed-position left gutter, aligned at the same horizontal position for every row regardless of nesting depth, and SHALL show a solid mark in the note's color for any row whose tag has a note.

#### Scenario: A noted tag is visible
- **WHEN** a tag with a note is rendered as a tree row
- **THEN** its row's gutter shows a solid mark in that note's color

#### Scenario: Gutter position is independent of nesting depth
- **WHEN** rows at different nesting depths are rendered
- **THEN** each row's gutter mark appears at the same horizontal position, unaffected by that row's indentation

### Requirement: Tree gutter indicates notes hidden by a collapsed branch
When a branch with descendant notes is collapsed, the tree view SHALL show, on that branch's row, a tick for each distinct color found among its descendant notes, deduplicated, up to 3 distinct colors. If more than 3 distinct colors are present among descendants, the gutter SHALL show an overflow indicator in place of the additional ticks.

#### Scenario: Collapsed branch hides notes of one color
- **WHEN** a collapsed branch contains descendant notes that are all the same color
- **THEN** its row's gutter shows a single tick in that color

#### Scenario: Collapsed branch hides notes of several colors
- **WHEN** a collapsed branch contains descendant notes in 2 or 3 distinct colors
- **THEN** its row's gutter shows one tick per distinct color

#### Scenario: Collapsed branch hides more distinct colors than can be shown
- **WHEN** a collapsed branch contains descendant notes in more than 3 distinct colors
- **THEN** its row's gutter shows an overflow indicator alongside the visible ticks, rather than silently omitting the excess

#### Scenario: Expanding a branch removes its aggregate indicator
- **WHEN** a previously collapsed branch showing aggregate ticks is expanded
- **THEN** its row's gutter no longer shows aggregate ticks, and any notes among its now-visible descendants are shown via their own rows' gutter marks instead

### Requirement: Notes list for the current file
The webview SHALL provide a list of every note in the currently open file, showing each note's color, associated tag, and an excerpt of its text, and SHALL let a user select an entry to navigate the tree to that tag — expanding any collapsed ancestors as needed, scrolling it into view, and selecting it.

#### Scenario: Notes list reflects current file's notes
- **WHEN** a file with existing notes is open
- **THEN** the notes list shows one entry per note, each with its color, tag, and a text excerpt

#### Scenario: Jump to a note from the list
- **WHEN** a user selects an entry in the notes list for a tag nested inside one or more collapsed branches
- **THEN** the necessary ancestor branches are expanded, the tree scrolls to that tag's row, and the row is selected

#### Scenario: Notes list updates when a note is added or removed
- **WHEN** a note is added, edited, or deleted
- **THEN** the notes list reflects the change without requiring the file to be reopened
