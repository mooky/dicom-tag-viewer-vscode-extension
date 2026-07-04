# dicom-standard-reference-resolution Specification

## Purpose
TBD - created by syncing change add-innolitics-tag-links. Update Purpose after archive.

## Requirements

### Requirement: Resolve a file's CIOD from its SOP Class UID
The system SHALL resolve a parsed file's Composite IOD (CIOD) by looking up its SOP Class UID (0008,0016) against a build-time-compiled table derived from the DICOM standard. If the SOP Class UID is absent from the file or not present in the compiled table (e.g. a private/vendor SOP Class), the system SHALL treat the CIOD as unresolved rather than guessing.

#### Scenario: Recognized standard SOP Class UID
- **WHEN** a parsed file's SOP Class UID matches a known standard Storage SOP Class
- **THEN** the system resolves the corresponding CIOD

#### Scenario: Unrecognized or missing SOP Class UID
- **WHEN** a parsed file has no SOP Class UID, or its SOP Class UID does not match any known standard SOP Class
- **THEN** the system treats the CIOD as unresolved

### Requirement: Resolve the owning module and reference link for a tag
Given a resolved CIOD and a selected tag's position in the tag tree (including tags nested inside sequences or multi-frame functional groups), the system SHALL resolve the module that owns that tag within that CIOD and produce a direct link to the corresponding dicom.innolitics.com page, using the tag's full ancestor chain (not just its own tag) to distinguish tags that occur at different nesting depths.

#### Scenario: Top-level tag with a single owning module
- **WHEN** a selected top-level tag's chain matches exactly one module of the resolved CIOD
- **THEN** the system produces a link to that module's page for that tag

#### Scenario: Tag nested inside a sequence
- **WHEN** a selected tag is nested inside one or more sequence items
- **THEN** the system resolves the link using the tag's full ancestor chain, producing a link to the correct nested attribute page rather than a top-level page for the same tag number

#### Scenario: Tag inside a multi-frame functional group
- **WHEN** a selected tag is nested inside a Shared or Per-Frame Functional Groups sequence of a multi-frame/Enhanced IOD
- **THEN** the system resolves the link using the same mechanism as any other nested tag, without requiring separate macro-specific logic

#### Scenario: Tag not part of the resolved CIOD
- **WHEN** a selected tag's chain does not match any module of the resolved CIOD
- **THEN** the system produces no reference link for that tag

### Requirement: Deterministic tie-break for multi-module matches
When a tag's chain matches more than one module of the resolved CIOD, the system SHALL deterministically choose exactly one module: preferring the module whose slug matches the CIOD's own slug, and otherwise breaking ties alphabetically by module slug. The system SHALL NOT present multiple candidate links for the same tag.

#### Scenario: Tag matches the CIOD's own module and a generic module
- **WHEN** a tag's chain matches both the module sharing the resolved CIOD's slug and a more generic module
- **THEN** the system links to the CIOD's own module

#### Scenario: Tag matches two generic modules with no CIOD-eponymous candidate
- **WHEN** a tag's chain matches two or more modules, none of which shares the resolved CIOD's slug
- **THEN** the system links to the alphabetically-first matching module slug

### Requirement: Fallback reference when no CIOD is resolved
When a file's CIOD cannot be resolved, the system SHALL produce a fallback reference link into the DICOM standard's PS3.6 data dictionary instead of an Innolitics link, for tags that have a known dictionary entry.

#### Scenario: Unresolved CIOD, known tag
- **WHEN** a file's CIOD is unresolved and a selected tag has a known standard dictionary entry
- **THEN** the system produces a PS3.6 fallback reference link instead of an Innolitics link

### Requirement: No reference link for private or unrecognized tags
The system SHALL NOT produce a reference link (Innolitics or PS3.6 fallback) for private tags or tags with no dictionary entry, regardless of whether a CIOD was resolved.

#### Scenario: Private tag selected
- **WHEN** a selected tag's group number is odd (a private tag)
- **THEN** the system produces no reference link

### Requirement: Reference data compiled at build time, not fetched at runtime
The resolution lookup data SHALL be compiled ahead of time from the upstream DICOM standard dataset into a minimal artifact bundled with the extension. The system SHALL NOT fetch reference data over the network at runtime, and the bundled artifact SHALL exclude fields not needed for link resolution (such as HTML descriptions and external cross-references) so the extension package does not carry the full size of the upstream dataset.

#### Scenario: Resolving a link with no network access
- **WHEN** a user selects a tag while offline
- **THEN** the system resolves the reference link (or determines none applies) using only the bundled compiled data
