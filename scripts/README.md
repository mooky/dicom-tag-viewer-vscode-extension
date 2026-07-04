# compile-dicom-standard-data.js

Compiles a small runtime lookup (`src/parsing/generated/dicomStandardReference.json`)
from the upstream [innolitics/dicom-standard](https://github.com/innolitics/dicom-standard)
dataset (MIT licensed). That lookup is what lets the detail pane link a
selected tag to the correct dicom.innolitics.com page for the file's IOD.

The upstream `module_to_attributes.json` is ~77MB — denormalized per CIOD and
full of HTML descriptions and cross-references we don't need just to build a
URL. This script reduces the four upstream tables it needs down to three
small maps:

- `sopClassUidToCiod`: SOP Class UID → CIOD slug
- `ciodToModules`: CIOD slug → candidate module slugs
- `chainToModules`: tag chain (e.g. `"00400555:00081199:00081150"`) → module
  slug(s) that declare that chain, across all modules

## Running it

```
node scripts/compile-dicom-standard-data.js
```

This fetches the upstream JSON from GitHub (no auth needed — it's a public
repo) and overwrites `src/parsing/generated/dicomStandardReference.json`.
Commit the regenerated file like any other generated/vendored artifact.

## When to re-run

The upstream dataset changes when NEMA publishes DICOM standard updates
(new IODs, new modules, corrected attribute tables). There's no automated
trigger for this — re-run the script periodically or when a user reports a
tag resolving to the wrong or a missing page, then:

1. Run the script.
2. `git diff` the output to sanity-check the change is reasonable in size
   (a new standard edition might add a few hundred entries; a diff touching
   most of the file suggests something upstream changed structurally, e.g.
   a renamed field — check the script still matches the current schema of
   `sops.json` / `ciods.json` / `ciod_to_modules.json` / `module_to_attributes.json`
   before trusting the output).
3. Commit the updated file.

## License / attribution

`innolitics/dicom-standard` is MIT licensed, which permits redistributing a
derived/compiled subset like this one. Attribution is captured here; the
generated file itself is just a set of tag/slug identifiers derived from the
public DICOM standard, not upstream's original prose, so it carries no
separate license notice of its own.
