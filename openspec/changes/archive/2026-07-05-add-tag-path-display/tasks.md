## 1. Path formatting

- [x] 1.1 Add a `formatTagPath(noteKey: string): string` helper in `src/webview/main.ts` that replaces every `>Item (\d+)` with `[$1]`, then replaces any remaining `>` with `.`
- [x] 1.2 Verify the helper against a top-level tag (no `>`), a tag nested one sequence level deep, and a tag nested two sequence levels deep

## 2. Detail pane UI

- [x] 2.1 In `renderDetail()`, add a "Path" field (via the existing `detailField` helper) showing `formatTagPath(node.noteKey)`, placed alongside the existing Tag/VR/Length/Value fields
- [x] 2.2 Add a "Copy Path" button next to the field (via the existing `makeButton` helper), dispatching the existing `copy` message with the formatted path text

## 3. Verification

- [x] 3.1 Manually verify against a sample `.dcm` file: a top-level tag's path shows just its own tag with no delimiter
- [x] 3.2 Manually verify a tag nested inside one sequence item shows `(gggg,eeee)[n].(gggg,eeee)`
- [x] 3.3 Manually verify a tag nested inside multiple sequence levels shows one dot-delimited, index-suffixed segment per level
- [x] 3.4 Manually verify "Copy Path" places the exact displayed path string on the clipboard
- [x] 3.5 Run existing build/test/lint scripts and confirm no regressions
