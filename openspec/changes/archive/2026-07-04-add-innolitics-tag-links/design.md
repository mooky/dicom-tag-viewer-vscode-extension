## Context

The detail pane (`src/webview/main.ts` `renderDetail()`) shows Tag/VR/Name/Length/Value for a selected node. Tag names/VRs come from a flat global dictionary (`src/parsing/dictionary.ts`, backed by the `dicom-data-dictionary` npm package) with no notion of IOD or module — a DICOM tag's meaning is global, but its *requirement type* (1/1C/2/2C/3) and the page that documents it on dicom.innolitics.com are scoped to a specific (CIOD, module) pair.

dicom.innolitics.com's own URL scheme reflects this: pages live at `/ciods/{ciod-slug}/{module-slug}/{tag-hex}[/{nested-tag-hex}...]`. There is no tag-only page independent of a CIOD+module. To link correctly we must resolve, per file, which CIOD it conforms to, and per tag, which module (and, for nested tags, which exact path within that module) owns it.

The exploration that preceded this proposal verified against the live site and against `github.com/innolitics/dicom-standard` (MIT licensed, the open-sourced dataset behind the site):

- `sops.json`: SOP Class UID → CIOD name.
- `ciods.json`: CIOD name → URL slug.
- `ciod_to_modules.json`: CIOD slug → candidate module slugs.
- `module_to_attributes.json`: module slug → attribute entries, each with a `path` field (e.g. `"acquisition-context:00400555:00081199:00081150"`) that already encodes the full nested tag chain within that module, and a `type` field (1/1C/2/2C/3).

Critically, functional-group macros used by Enhanced/multi-frame IODs (e.g. Enhanced MR's per-frame Frame Content, Pixel Measures, etc.) are **already flattened** into a synthetic per-CIOD module in `module_to_attributes.json` (e.g. `enhanced-mr-image-multi-frame-functional-groups`, verified to contain 1,716 fully-pathed entries). This means no separate macro-resolution logic is needed — the same module lookup handles top-level, nested-in-sequence, and nested-in-functional-group tags uniformly. A live 3-deep nested URL was verified to resolve correctly: `/ciods/nuclear-medicine-image/acquisition-context/00400555/00081199/00081150`.

`module_to_attributes.json` is 77MB raw (every macro duplicated per CIOD that includes it, plus HTML descriptions and cross-reference links we don't need). That cannot be shipped as-is in a VS Code extension.

The extension's `TreeNode` (`src/common/protocol.ts`) already tracks each node's ancestry via `noteKey`, a string chain like `"(0040,0555)>Item 0>(0008,1199)>(0008,1150)"`. This is the same shape of information as `module_to_attributes.json`'s `path` field, modulo formatting (`Item N` segments need stripping, tags need hex-only formatting, separators differ).

## Goals / Non-Goals

**Goals:**
- Deterministically resolve a file's CIOD from its SOP Class UID.
- Deterministically resolve the owning module (and thus the exact Innolitics URL) for any selected tag, including tags nested inside sequences and multi-frame functional groups.
- Keep the bundled lookup data small — target low single-digit MB, not the 77MB raw upstream size.
- Document a single, deterministic tie-break rule for the ~3% of tags that map to more than one module of the resolved CIOD (measured on CT Image), so behavior is predictable rather than arbitrary.

**Non-Goals:**
- Presenting multiple candidate links when a tag matches more than one module — this version always picks exactly one link via the documented heuristic, per prior user decision.
- Automatically re-running the data compilation on every build — it runs on demand against the upstream repo and the compiled artifact is committed, similar to a vendored dependency.
- Resolving links for private tags or tags absent from the compiled lookup — these continue to show no link.
- Solving the PS3.6 fallback URL scheme in this document — see Open Questions.

## Decisions

### Compile upstream data at build time into a minimal runtime lookup
Fetch `sops.json`, `ciods.json`, `ciod_to_modules.json`, and `module_to_attributes.json` from `innolitics/dicom-standard` with a standalone script (e.g. `scripts/compile-dicom-standard-data.*`), run manually/on demand (not on every `npm run build`), and commit its output under the repo (e.g. `src/parsing/generated/dicomStandardReference.json` or a small set of JS/TS modules). The compiled form drops HTML descriptions, `linkToStandard`, `externalReferences`, and any fields not needed for URL construction, keeping only:
- SOP Class UID → CIOD slug
- CIOD slug → list of module slugs (already small)
- `{moduleSlug}:{hexTagChain}` → moduleSlug (the `path` string can be discarded once used as a key at compile time; we only need to answer "does this module contain this chain" and, when ambiguous, "which modules do")

This alone should cut the multi-tens-of-MB source down to low single-digit MB given the actual entropy is a set of hex tag chains per module, not prose.

*Alternative considered*: ship the raw JSON and parse/filter at extension activation time. Rejected — 77MB is not reasonable to bundle or parse at startup in a VS Code extension regardless of when filtering happens.

*Alternative considered*: fetch data at runtime from Innolitics/GitHub. Rejected — requires network access and online availability for a feature that should work offline, and upstream data can change without extension version pinning.

### Resolution algorithm
1. During parsing, capture SOP Class UID (0008,0016) alongside the existing SOP Instance UID (`src/parsing/parseDicom.ts`).
2. Resolve CIOD: `SOP Class UID → sops.json → CIOD name → ciods.json → CIOD slug`. Missing/unrecognized SOP Class UID → no CIOD resolved.
3. For a selected node, derive its hex tag chain from the existing ancestry chain (same data as `noteKey`), stripping `Item N` segments and formatting each tag as 8 hex characters.
4. Look up candidate modules for the resolved CIOD (`ciod_to_modules.json`), then filter to modules whose compiled lookup contains `{moduleSlug}:{hexChain}`.
   - 0 matches → tag isn't part of this IOD's declared attributes; no Innolitics link (falls through to the unresolved-CIOD fallback logic only if the CIOD itself didn't resolve — a resolved CIOD with 0 matching modules for this specific tag simply shows no link).
   - 1 match → build the link directly: `/ciods/{ciod}/{moduleSlug}/{hexChain segments joined by '/'}`.
   - 2+ matches → apply the tie-break: prefer the module whose slug equals (or shares the longest common prefix with) the CIOD's own slug; if still tied, pick alphabetically by module slug. (Measured: this resolves ~90% of collisions correctly on CT Image; the remainder is a documented, accepted coin-flip between two generically-named modules.)
5. If no CIOD resolved (step 2 failed): show the PS3.6 fallback link instead (see Open Questions for the exact URL scheme).
6. Private tags and tags with no dictionary entry (`src/parsing/dictionary.ts` `isPrivate`/unknown handling) never get a link, regardless of the above.

### Where resolution runs
Resolution runs in the extension host (Node context), not the webview, since it needs the compiled lookup data and the parsed SOP Class UID. The simplest integration point is alongside existing tree-building in `parseDicom.ts`/`dicomDocument.ts`: attach the resolved link (or `undefined`) to each `TreeNode` when the tree is built, so the webview only ever renders a precomputed URL string — no resolution logic duplicated in the webview.

*Alternative considered*: send the compiled lookup to the webview and resolve links lazily on selection. Rejected — needlessly duplicates the lookup data across the postMessage boundary and the webview has no independent need for it beyond rendering.

## Risks / Trade-offs

- **[Risk]** Ambiguous module matches (~3% of top-level tags) can pick a less-specific module than a human would. → Mitigation: documented heuristic resolves ~90% of those correctly by preferring the CIOD-eponymous module; the remainder is an accepted, deterministic coin-flip rather than silent nondeterminism.
- **[Risk]** Upstream `innolitics/dicom-standard` data can change (new DICOM standard editions, corrections). A stale compiled artifact could link to a module structure that no longer matches the live site. → Mitigation: document the refresh process (re-run the compile script, diff, commit) as a maintenance task; this is a periodic manual refresh, not a runtime dependency.
- **[Risk]** SOP Class UIDs for retired, draft, or vendor-private SOP classes won't resolve to any CIOD. → Mitigation: explicit fallback path (PS3.6 link) rather than silently showing nothing; keeps behavior predictable even when it isn't Innolitics-specific.
- **[Trade-off]** Compiling and committing a generated data artifact adds a vendored/generated file to the repo that needs periodic manual refresh, rather than always reflecting the latest standard. Accepted in exchange for offline operation and small package size.

## Open Questions

- **PS3.6 fallback URL/anchor scheme is unverified.** PS3.6 (Part 6: Data Dictionary) is published as a single large HTML table in the DICOM standard; it's not yet confirmed whether it has stable per-tag anchor IDs suitable for direct deep-linking, or whether the fallback should instead link to the PS3.6 table page without a tag-specific anchor. Needs a short spike before implementing this fallback path.
- **Exact compiled artifact format/location** (single JSON vs. generated TS modules; where under `src/` it lives) is left to implementation, informed by whatever keeps bundle size smallest and lookup fastest.
