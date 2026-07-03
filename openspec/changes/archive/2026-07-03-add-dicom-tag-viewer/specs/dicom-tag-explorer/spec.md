## ADDED Requirements

### Requirement: Render the parsed tag tree
The webview SHALL render the tag-tree model received from the extension host as a collapsible tree, with sequence (SQ) elements shown as nested, independently expandable/collapsible subtrees.

#### Scenario: Model received on load
- **WHEN** the webview receives the initial tag-tree model
- **THEN** it renders each top-level element as a collapsible tree row, and sequence elements' items as nested collapsible rows beneath their parent

#### Scenario: Expand a sequence element
- **WHEN** a user expands a sequence (SQ) element's row
- **THEN** its nested items are revealed without affecting the expand/collapse state of sibling rows

### Requirement: Search and filter the tag tree
The webview SHALL provide a search input that filters the visible tree to elements whose tag, name, or value matches the entered text, updating as the user types.

#### Scenario: Search by tag name
- **WHEN** a user types a partial tag name into the search box
- **THEN** the tree updates to show only matching elements (and their ancestor rows, for nested matches)

#### Scenario: Clear search
- **WHEN** a user clears the search input
- **THEN** the full tag tree is shown again in its prior expand/collapse state

### Requirement: Detail pane with VR-aware formatted values
Selecting a tree row SHALL display that element's full details — tag, name, VR, length, and formatted value — in a detail pane, with values formatted appropriately for their VR (e.g. dates, person names, UIDs resolved to known meanings where applicable).

#### Scenario: Select an element with a known VR
- **WHEN** a user selects a tree row for an element with a recognized VR
- **THEN** the detail pane shows the value formatted according to that VR's convention

### Requirement: On-demand hex view for binary elements
For elements whose bytes were not included in the initial model, the detail pane SHALL offer to load and display the element's raw bytes as hex by requesting them from the extension host.

#### Scenario: View hex for a pixel data element
- **WHEN** a user selects a binary element (e.g. pixel data) and requests its hex view
- **THEN** the webview requests the bytes from the extension host and displays the returned bytes in hex form once received

### Requirement: Copy tag identifier or value
The webview SHALL let a user copy a selected element's tag identifier or its value to the system clipboard.

#### Scenario: Copy a value
- **WHEN** a user triggers copy on a selected element's value
- **THEN** that value is placed on the system clipboard
