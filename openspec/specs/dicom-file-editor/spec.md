# dicom-file-editor Specification

## Purpose
TBD - created by archiving change add-dicom-tag-viewer. Update Purpose after archive.

## Requirements

### Requirement: Custom editor registration for .dcm files
The extension SHALL register a read-only custom editor for files matching the `*.dcm` pattern, using VS Code's custom editor contribution point.

#### Scenario: Extension activates and registers the editor
- **WHEN** the extension is activated
- **THEN** a custom editor with view type identifying the DICOM viewer is registered for the `*.dcm` filename pattern

### Requirement: Open .dcm files via drag-and-drop or double-click
The system SHALL open `.dcm` files in the registered custom editor when the user drags a file from the OS file explorer onto the VS Code editor area, or double-clicks a `.dcm` file, using VS Code's built-in file-open routing with no custom drop handler.

#### Scenario: Drag a .dcm file from File Explorer onto VS Code
- **WHEN** a user drags a file named `*.dcm` from the OS file explorer and drops it onto the VS Code editor area
- **THEN** the file opens in the DICOM custom editor showing its parsed tag tree

#### Scenario: Double-click a .dcm file
- **WHEN** a user double-clicks a `*.dcm` file in the VS Code Explorer view
- **THEN** the file opens in the DICOM custom editor showing its parsed tag tree

### Requirement: Parse DICOM file into a serializable tag-tree model
On opening a document, the extension host SHALL read the file bytes and parse them into a tree of data elements, each carrying tag, human-readable name (from a data dictionary, or a fallback label if unknown), VR, length, and a formatted value where applicable, with sequence (SQ) elements represented as nested items recursively.

#### Scenario: Parse a well-formed DICOM file
- **WHEN** a valid `.dcm` file is opened
- **THEN** the extension host produces a tree model whose nodes include tag, name, VR, length, and formatted value, with any sequence elements' items nested under their parent node

#### Scenario: Tag not found in data dictionary
- **WHEN** the parsed file contains a private or unrecognized tag
- **THEN** the corresponding tree node is included with a fallback name (e.g. "Private Tag" or "Unknown") rather than being omitted

### Requirement: Exclude large binary payloads from the initial model
The extension host SHALL NOT include the raw bytes of large binary elements (including pixel data) in the model sent to the webview when the document is first opened. Such elements SHALL instead be represented by their tag, VR, length, and an offset handle for later on-demand retrieval.

#### Scenario: File contains pixel data
- **WHEN** a `.dcm` file containing a pixel data element is opened
- **THEN** the initial model sent to the webview includes that element's tag, VR, and length but not its raw byte content
- **AND** the element carries a handle sufficient to request its bytes later

### Requirement: Serve on-demand hex retrieval for binary elements
The extension host SHALL respond to a webview request for a binary element's bytes by reading the requested byte range from the source file and returning it, without requiring the entire file or element to have been loaded into the initial model.

#### Scenario: Webview requests hex bytes for a binary element
- **WHEN** the webview sends a request for a specific binary element's bytes by its handle
- **THEN** the extension host reads the corresponding byte range from the file and sends it back to the webview

### Requirement: Handle unparsable files gracefully
The extension host SHALL catch errors during file reading or parsing and cause the editor to present a clear error state rather than crashing the extension host or leaving the editor blank.

#### Scenario: Opening a malformed or non-DICOM file
- **WHEN** a file matching `*.dcm` cannot be parsed as valid DICOM
- **THEN** the custom editor displays an error indication instead of a tag tree, and the extension host remains stable
