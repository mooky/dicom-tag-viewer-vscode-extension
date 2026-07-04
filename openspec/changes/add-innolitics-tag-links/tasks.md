## 1. Data compilation (build-time, do first)

- [ ] 1.1 Write a standalone script (e.g. `scripts/compile-dicom-standard-data.*`) that fetches `sops.json`, `ciods.json`, `ciod_to_modules.json`, and `module_to_attributes.json` from `innolitics/dicom-standard`.
- [ ] 1.2 Compile those into a minimal runtime lookup: SOP Class UID → CIOD slug; CIOD slug → module slugs; `{moduleSlug}:{hexTagChain}` → owning module slug(s). Drop HTML descriptions, `linkToStandard`, `externalReferences`, and any other fields not needed for URL construction.
- [ ] 1.3 Run the script, commit the compiled artifact under `src/`, and record its size. Confirm it lands in the low-single-digit-MB target, not anywhere near the 77MB raw source — adjust the compiled schema (e.g. more compact key encoding) if it doesn't.
- [ ] 1.4 Document the refresh process (re-run script, diff output, commit) in a README near the script, since the upstream dataset changes as the DICOM standard evolves.
- [ ] 1.5 Confirm `innolitics/dicom-standard`'s MIT license permits redistributing a derived/compiled subset, and note attribution if required.

## 2. Parsing: capture SOP Class UID

- [ ] 2.1 In `src/parsing/parseDicom.ts`, read SOP Class UID (0008,0016) alongside the existing SOP Instance UID read.
- [ ] 2.2 Thread the SOP Class UID through `ParseResult` (or equivalent) to wherever tree-building happens.

## 3. Resolution logic

- [ ] 3.1 Add a module that, given a SOP Class UID, resolves a CIOD slug using the compiled lookup from Section 1 (or `undefined` if unresolved).
- [ ] 3.2 Add a function that, given a tag's ancestor chain (same shape as `noteKey`), strips `Item N` segments and formats it as a colon/slash-ready hex chain.
- [ ] 3.3 Add the core resolver: CIOD slug + hex chain → candidate modules → 0/1/2+ match handling, including the documented tie-break (prefer CIOD-eponymous module slug, else alphabetical).
- [ ] 3.4 Build the final Innolitics URL from the resolved module + hex chain segments for the 1-match and tie-broken cases.
- [ ] 3.5 Wire resolution into tree-building (e.g. `parseDicom.ts`/`dicomDocument.ts`) so each `TreeNode` carries its resolved link (or `undefined`) — resolution happens once in the extension host, not per-render in the webview.
- [ ] 3.6 Ensure private tags and tags with no dictionary entry (per `dictionary.ts`) never get a link, independent of CIOD resolution.

## 4. PS3.6 fallback spike

- [ ] 4.1 Spike: determine whether PS3.6's published data dictionary has stable per-tag anchors suitable for deep-linking, or whether the fallback should link to the dictionary page without a tag anchor.
- [ ] 4.2 Implement the fallback: when no CIOD resolves but the tag has a known dictionary entry, produce the PS3.6 link determined by the spike.

## 5. Protocol and webview

- [ ] 5.1 Extend `TreeNode` (`src/common/protocol.ts`) with the resolved reference link field.
- [ ] 5.2 In `renderDetail()` (`src/webview/main.ts`), render the link when present; show nothing extra when absent.

## 6. Verification

- [ ] 6.1 Test against sample files across a few distinct CIODs (e.g. CT Image, MR Image) confirming top-level tag links match manually-verified Innolitics pages.
- [ ] 6.2 Test a nested-sequence tag and an Enhanced/multi-frame functional-group tag, confirming the nested-path link resolves correctly.
- [ ] 6.3 Test a file with a private tag, a file with an unrecognized/missing SOP Class UID, and a tag known to hit the multi-module tie-break case, confirming each falls back/resolves as specified.
- [ ] 6.4 Confirm extension package size increase from the compiled data artifact is in the expected low-single-digit-MB range.
