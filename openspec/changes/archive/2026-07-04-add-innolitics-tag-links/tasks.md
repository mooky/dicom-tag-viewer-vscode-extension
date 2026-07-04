## 1. Data compilation (build-time, do first)

- [x] 1.1 Write a standalone script (e.g. `scripts/compile-dicom-standard-data.*`) that fetches `sops.json`, `ciods.json`, `ciod_to_modules.json`, and `module_to_attributes.json` from `innolitics/dicom-standard`.
- [x] 1.2 Compile those into a minimal runtime lookup: SOP Class UID → CIOD slug; CIOD slug → module slugs; `{moduleSlug}:{hexTagChain}` → owning module slug(s). Drop HTML descriptions, `linkToStandard`, `externalReferences`, and any other fields not needed for URL construction.
- [x] 1.3 Run the script, commit the compiled artifact under `src/`, and record its size. Confirm it lands in the low-single-digit-MB target, not anywhere near the 77MB raw source — adjust the compiled schema (e.g. more compact key encoding) if it doesn't.
- [x] 1.4 Document the refresh process (re-run script, diff output, commit) in a README near the script, since the upstream dataset changes as the DICOM standard evolves.
- [x] 1.5 Confirm `innolitics/dicom-standard`'s MIT license permits redistributing a derived/compiled subset, and note attribution if required.

## 2. Parsing: capture SOP Class UID

- [x] 2.1 In `src/parsing/parseDicom.ts`, read SOP Class UID (0008,0016) alongside the existing SOP Instance UID read.
- [x] 2.2 Thread the SOP Class UID through `ParseResult` (or equivalent) to wherever tree-building happens.

## 3. Resolution logic

- [x] 3.1 Add a module that, given a SOP Class UID, resolves a CIOD slug using the compiled lookup from Section 1 (or `undefined` if unresolved).
- [x] 3.2 Add a function that, given a tag's ancestor chain (same shape as `noteKey`), strips `Item N` segments and formats it as a colon/slash-ready hex chain.
- [x] 3.3 Add the core resolver: CIOD slug + hex chain → candidate modules → 0/1/2+ match handling, including the documented tie-break (prefer CIOD-eponymous module slug, else alphabetical).
- [x] 3.4 Build the final Innolitics URL from the resolved module + hex chain segments for the 1-match and tie-broken cases.
- [x] 3.5 Wire resolution into tree-building (e.g. `parseDicom.ts`/`dicomDocument.ts`) so each `TreeNode` carries its resolved link (or `undefined`) — resolution happens once in the extension host, not per-render in the webview.
- [x] 3.6 Ensure private tags and tags with no dictionary entry (per `dictionary.ts`) never get a link, independent of CIOD resolution.

## 4. PS3.6 fallback spike

- [x] 4.1 Spike: determine whether PS3.6's published data dictionary has stable per-tag anchors suitable for deep-linking, or whether the fallback should link to the dictionary page without a tag anchor. **Finding**: per-tag anchors exist but are opaque build-generated UUIDs (e.g. `para_b68b0246-...`) unrelated to the tag value — not derivable without scraping and shipping a second large lookup. Fallback links to the PS3.6 chapter 6 page without a tag anchor.
- [x] 4.2 Implement the fallback: when no CIOD resolves but the tag has a known dictionary entry, produce the PS3.6 link determined by the spike.

## 5. Protocol and webview

- [x] 5.1 Extend `TreeNode` (`src/common/protocol.ts`) with the resolved reference link field.
- [x] 5.2 In `renderDetail()` (`src/webview/main.ts`), render the link when present; show nothing extra when absent.

## 6. Verification

- [x] 6.1 Test against sample files across a few distinct CIODs (e.g. CT Image, MR Image) confirming top-level tag links match manually-verified Innolitics pages. Added a real SOP Class UID (CT Image Storage) to `sample-files/generate-samples.js` so `valid-sample.dcm` exercises the resolved-CIOD path end-to-end; every resolved link (SOPClassUID, PatientName, Modality, SamplesPerPixel, PixelData, etc.) spot-checked live (200).
- [x] 6.2 Test a nested-sequence tag and an Enhanced/multi-frame functional-group tag, confirming the nested-path link resolves correctly. Verified `nuclear-medicine-image/acquisition-context/...` (3-deep sequence) and `enhanced-mr-image/enhanced-mr-image-multi-frame-functional-groups/...` (Shared Functional Groups > Frame Content macro) both resolve and return live 200s.
- [x] 6.3 Test a file with a private tag, a file with an unrecognized/missing SOP Class UID, and a tag known to hit the multi-module tie-break case, confirming each falls back/resolves as specified. `valid-sample.dcm`'s private tags (0009,0010)/(0009,1001) get no link; a bogus SOP Class UID falls back to the PS3.6 dictionary link; `(0008,0008) Image Type` under CT Image resolves to the `ct-image` module (not `general-image`), confirming the tie-break heuristic.
- [x] 6.4 Confirm extension package size increase from the compiled data artifact is in the expected low-single-digit-MB range. Compiled data is 5.28MB raw, but built into `dist/extension.js` and packaged via `vsce package`, the full `.vsix` is **268 KB** (JSON compresses very well) — comfortably under target. Also excluded `scripts/` from the packaged vsix (`.vscodeignore`) since it's a build-time-only tool, same treatment as `sample-files/`.

### Bug found and fixed during verification
Upstream `module_to_attributes.json` paths use lowercase hex for tags with A–F digits (e.g. `7fe00010`), but the resolver was comparing against `toDictKey()`'s uppercase output, silently failing to resolve links for any tag containing a hex letter (caught via PixelData `(7FE0,0010)` resolving to no link when it should have). Fixed by lowercasing the hex chain in `resolveReferenceUrl` before both the lookup and URL construction.
