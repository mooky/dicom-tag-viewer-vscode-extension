## Why

For a tag nested inside one or more sequences, the detail pane currently shows only that tag's own identifier (e.g. `(0040,0009)`), with no indication of which sequence or item it lives inside. Correlating a nested tag with other DICOM tooling (conformance statements, DICOMweb queries, other viewers) requires knowing its full ancestry, which today means manually expanding and re-reading the tree.

## What Changes

- Add a read-only "Path" field to the detail pane showing the selected tag's full ancestry as a single string, formatted as `(gggg,eeee)[itemIndex].(gggg,eeee)` — dot-delimited per DICOM PS3.18's attribute-path grammar, with a `[n]` zero-based item index (not part of the standard, since QIDO-RS matching has no need to address one specific item) appended to any sequence tag whose item is part of the path.
- Add a "Copy Path" button next to the new field, matching the existing "Copy Tag"/"Copy Value" pattern.
- The path is derived entirely from the existing internal `noteKey` ancestry string already carried by every tree node — no new data is parsed, computed, or persisted.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `dicom-tag-explorer`: the detail pane requirement is extended to include a full ancestry path for the selected tag, and the copy requirement is extended to cover copying that path.

## Impact

- `src/webview/main.ts`: new path-formatting function (derived from `noteKey`) and a new detail-pane field + copy button, following the existing `detailField`/`makeButton` patterns.
- No changes to `src/parsing/**`, `src/common/protocol.ts`, or any persisted data shape — this is a pure display feature over data that already exists on every `TreeNode`.
