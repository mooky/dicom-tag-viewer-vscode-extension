## Context

Every `TreeNode` ([src/common/protocol.ts](../../../src/common/protocol.ts)) already carries a `noteKey` — a stable ancestry chain built in [src/parsing/parseDicom.ts](../../../src/parsing/parseDicom.ts) and used internally as the identity key for notes/highlights persistence. Its format is:

```
(0040,0100)>Item 0>(0040,0009)
```

`>` separates every ancestor; a sequence's chosen item appears as its own literal `Item N` segment (0-based, per `` `Item ${index}` `` at parseDicom.ts:89). This string is never shown to the user today — the one exception is a fallback label in the Notes/Highlights list when a node can't be resolved after drift, which prints the raw `noteKey` as-is.

Separately, [src/parsing/dicomStandardReference.ts](../../../src/parsing/dicomStandardReference.ts) builds an unrelated `hexChain` (colon-joined, tag-only, no item index) purely to resolve DICOM-standard reference URLs — module membership doesn't depend on which item, so it deliberately omits item indices. It is not reused here; it solves a different problem (schema-level lookup vs. pointing at one concrete element).

Checked against DICOM PS3.18 §8.3 (QIDO-RS query parameter syntax), which formally defines a dot-delimited nested-attribute grammar:

```
attribute          = simple-attribute / sequence-attribute
simple-attribute    = keyword / tag
sequence-attribute  = (keyword / tag) *("." attribute)
tag                 = 8HEXDIG
```

The `.` delimiter is standard. Item-index disambiguation is not — QIDO-RS matching is existential ("any item satisfying X"), so the standard never needed a way to address one specific item. There is nothing to adopt for that part; `[n]` is this extension's own convention layered on top of an otherwise-standard delimiter.

## Goals / Non-Goals

**Goals:**
- Show the selected tag's full ancestry path in the detail pane, so a nested tag's location is legible without manually expanding/re-reading the tree.
- Let a user copy that path to the clipboard.
- Delimiter aligns with DICOM PS3.18's dot-separated attribute-path grammar.

**Non-Goals:**
- No reverse direction (paste a path, jump to that element) — a real feature, but a different one (parsing untrusted input, validating against the current tree, handling malformed/stale paths). Not in scope here.
- No change to `noteKey`'s own format, the persistence shape for notes/highlights, or the parser — this is a pure display feature over data that already exists.
- No default naming of notes/highlights derived from the path.

## Decisions

### Derive the path by reformatting `noteKey`, not by adding a new field
**Decision:** `noteKey` already encodes 100% of the needed ancestry information. The path is produced by a pure string transform: replace every `>Item (\d+)` with `[$1]`, then replace any remaining `>` with `.`. E.g. `(0040,0100)>Item 0>(0040,0009)` → `(0040,0100)[0].(0040,0009)`. This needs no new parser output, no protocol field, and no persistence change — `noteKey` keeps its existing shape and meaning.
**Alternative considered:** Add a separate `tagPath` field computed at parse time in `parseDicom.ts`, parallel to `noteKey`/`hexChain`. Rejected — it would duplicate information already fully present in `noteKey`, for a value only needed at render time in one place.

### Use the app's existing `(gggg,eeee)` tag notation, not bare PS3.18 hex or DICOM keyword
**Decision:** Each tag segment in the path uses the same `(gggg,eeee)` display form already shown in the "Tag" field directly above it in the same panel.
**Alternatives considered:**
- Bare 8-hex-digit form (`00400100[0].00400009`), matching PS3.18's literal wire grammar exactly. Rejected — would read inconsistently sitting right next to the existing `(0040,0100)` tag display in the same detail pane.
- DICOM keyword form (`ScheduledProcedureStepSequence[0].ScheduledProcedureStepID`). Rejected — breaks for private/unknown tags, since `lookupTag()` only returns generic "Private Tag"/"Unknown Tag" names for those, and private tags are exactly the ones a user is most likely to want to inspect closely.

### Compute on render, not cached
**Decision:** The path is computed from `noteKey` at the moment the detail pane renders the selected node — a single regex-based string transform, cheap enough to not warrant caching (mirrors how the detail pane already recomputes other derived fields per selection).
**Alternative considered:** Precompute a path string per node alongside `noteKeyToPath`/`noteKeyToNode` during `recomputeNoteIndexes()`. Rejected as unnecessary — it's only read once per selection change, not per row per render (unlike gutter/lane computations, which run per visible row).

## Risks / Trade-offs

- **[Risk] The `Item N` text pattern is the only signal distinguishing a sequence-item segment from a regular tag segment in `noteKey` — the synthetic Item node's own `tag` field is a fixed placeholder (`(FFFE,E000)`), not usable for detection.** → Mitigation: match on the literal `>Item (\d+)` substring (already how the parser constructs these segments), not on any tag value.
- **[Risk] `[n]` has no standing in the DICOM standard, so a user comparing this path against a QIDO-RS query or a PS3.18-literate tool won't find an exact match.** → Mitigation: none needed — this is a legibility aid for a human reading the tree, not a wire-format identifier; the delimiter (the only part that could plausibly cause confusion by looking standard when it isn't) is in fact standard.

## Migration Plan

Purely additive UI — no data migration, no protocol version bump, no rollback concerns beyond reverting the extension version.
