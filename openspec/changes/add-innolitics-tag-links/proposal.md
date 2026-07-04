## Why

The detail pane shows a tag's name, VR, and value, but gives no way to see what the DICOM standard actually says about that attribute in context (its Type 1/1C/2/2C/3 requirement, description, enumerated values). dicom.innolitics.com publishes a browsable mirror of the standard organized by CIOD → Module → Attribute, but its URLs are scoped to a specific (CIOD, module) pair — so linking to it correctly requires resolving which IOD the open file conforms to and which module owns the selected tag, not just looking the tag up in a flat dictionary.

## What Changes

- Capture the file's SOP Class UID (0008,0016) during parsing, in addition to the existing SOP Instance UID.
- Add an offline build step that compiles the upstream `innolitics/dicom-standard` JSON tables (SOP Class UID → CIOD, CIOD → modules, module → attribute paths) into a small runtime lookup bundled with the extension, instead of shipping the raw ~77MB upstream dataset.
- Add a resolution step that, given a selected tag's tag-chain (its existing parent-chain, reusing the same path shape as `noteKey`) and the file's resolved CIOD, determines the owning module and produces a direct link to the matching dicom.innolitics.com page, including for tags nested inside sequences and multi-frame functional groups.
- When a tag's chain matches more than one module of the resolved CIOD, resolve deterministically: prefer the module whose slug matches the CIOD's own slug, otherwise break ties alphabetically by module slug.
- When the SOP Class UID is missing or not a recognized standard CIOD (private/vendor SOP class), fall back to a link into the DICOM standard PS3.6 data dictionary instead of an Innolitics link. The exact PS3.6 URL/anchor scheme is unverified and is called out as an open question in design.md — this proposal doesn't hard-code an unverified fallback link.
- Render the resolved link (Innolitics or PS3.6 fallback) in the detail pane for tags that have one. Private tags and unrecognized tags continue to show no link, as today.

## Capabilities

### New Capabilities
- `dicom-standard-reference-resolution`: given a parsed file's SOP Class UID and a selected tag's position in the tag tree, deterministically resolves the correct CIOD/module context and produces a link to the matching DICOM standard reference page (dicom.innolitics.com, or a PS3.6 fallback when no CIOD can be resolved). Includes the build-time data compilation that keeps this lookup small enough to bundle with the extension.

### Modified Capabilities
- `dicom-tag-explorer`: the detail pane's "Detail pane with VR-aware formatted values" requirement gains a standard-reference link, shown when resolution succeeds.

## Impact

- `src/parsing/parseDicom.ts`: capture SOP Class UID alongside SOP Instance UID; the CIOD resolution needs it before any per-tag work.
- `src/parsing/dictionary.ts`: currently a flat global dictionary with no module/IOD awareness; the new resolution logic sits alongside it as a separate concern rather than folded in.
- `src/common/protocol.ts`: the `ExtToWebviewMessage` model likely needs to carry each node's resolved reference link (or enough info for the webview to request it) — exact shape is a design.md decision.
- `src/webview/main.ts` (`renderDetail`): add the reference link to the rendered fields.
- New build tooling: a script (run at build/package time, not at runtime) that fetches/compiles the upstream `innolitics/dicom-standard` tables into a bundled lookup artifact, plus a documented refresh process since the upstream dataset changes as the standard evolves.
- New dependency: `innolitics/dicom-standard` (MIT licensed) as a build-time data source only — not a runtime npm dependency.
- Package size: adds a compiled lookup artifact to the extension bundle; target is low single-digit MB, explicitly not the 77MB raw upstream file.
