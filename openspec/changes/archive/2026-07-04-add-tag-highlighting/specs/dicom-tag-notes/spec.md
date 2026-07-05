## MODIFIED Requirements

### Requirement: Per-file color palette
The webview SHALL offer a color palette for notes and highlights, pre-populated with 6 default colors, and SHALL let a user add custom colors beyond the defaults. The palette, including any custom colors added, SHALL be persisted as part of that file's own annotation data (shared by both notes and highlights) and SHALL NOT be shared with or applied to any other file.

#### Scenario: Default palette available on a file with no prior notes
- **WHEN** a user opens a file with no existing notes and begins adding a note
- **THEN** the 6 default colors are offered as swatch choices

#### Scenario: Custom color persists for the same file
- **WHEN** a user adds a custom color while annotating a file, then closes and reopens that same file
- **THEN** the custom color is still offered as a swatch choice for that file

#### Scenario: Custom color does not appear in a different file
- **WHEN** a user adds a custom color while annotating one file, then opens a different file
- **THEN** the other file's palette shows only its own defaults and any custom colors previously added specifically to it

#### Scenario: A custom color added via a highlight is available to notes
- **WHEN** a user adds a custom color while creating or editing a highlight
- **THEN** that color is also offered as a swatch choice when adding or editing a note in the same file, and vice versa
