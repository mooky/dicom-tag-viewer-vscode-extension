## MODIFIED Requirements

### Requirement: Detail pane with VR-aware formatted values
Selecting a tree row SHALL display that element's full details — tag, name, VR, length, formatted value, and full ancestry path — in a detail pane, with values formatted appropriately for their VR (e.g. dates, person names, UIDs resolved to known meanings where applicable). The ancestry path SHALL show every ancestor tag using the same `(gggg,eeee)` notation used elsewhere in the pane, dot-delimited, with a zero-based `[itemIndex]` suffix on any ancestor that is a sequence whose item the selected element descends through.

#### Scenario: Select an element with a known VR
- **WHEN** a user selects a tree row for an element with a recognized VR
- **THEN** the detail pane shows the value formatted according to that VR's convention

#### Scenario: Select a top-level element
- **WHEN** a user selects a tree row for a top-level element (no sequence ancestry)
- **THEN** the detail pane's path field shows only that element's own tag, with no delimiter or item index

#### Scenario: Select an element nested inside one sequence item
- **WHEN** a user selects a tree row for a tag inside item 0 of a sequence
- **THEN** the detail pane's path field shows the sequence's tag with a `[0]` suffix, followed by a `.` and the selected tag, e.g. `(0040,0100)[0].(0040,0009)`

#### Scenario: Select an element nested inside multiple sequence levels
- **WHEN** a user selects a tag nested inside sequences at more than one level
- **THEN** the detail pane's path field shows one dot-delimited segment per ancestor level, each sequence ancestor's segment suffixed with its own zero-based item index

### Requirement: Copy tag identifier or value
The webview SHALL let a user copy a selected element's tag identifier, its value, or its full ancestry path to the system clipboard.

#### Scenario: Copy a value
- **WHEN** a user triggers copy on a selected element's value
- **THEN** that value is placed on the system clipboard

#### Scenario: Copy a path
- **WHEN** a user triggers copy on a selected element's ancestry path
- **THEN** the full path string shown in the detail pane is placed on the system clipboard
