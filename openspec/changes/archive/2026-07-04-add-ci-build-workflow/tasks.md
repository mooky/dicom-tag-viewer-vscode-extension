## 1. Workflow file

- [x] 1.1 Create `.github/workflows/build.yml`
- [x] 1.2 Configure `on.push.branches` to trigger on `feature/**` and `main`
- [x] 1.3 Define a single `build` job on `ubuntu-latest`

## 2. Build steps

- [x] 2.1 Add `actions/checkout` step
- [x] 2.2 Add `actions/setup-node` step pinned to Node 24
- [x] 2.3 Add `npm ci` step
- [x] 2.4 Add `npm run compile` step (typecheck + esbuild bundle)
- [x] 2.5 Add `npm run package:vsix` step (produces the `.vsix`)

## 3. Artifact upload

- [x] 3.1 Add `actions/upload-artifact` step that uploads the produced `*.vsix` file

## 4. Verification

- [x] 4.1 Push to a `feature/**` branch and confirm the workflow triggers and succeeds
- [x] 4.2 Confirm the `.vsix` artifact is downloadable from the workflow run
- [x] 4.3 Confirm a push to `main` also triggers the workflow
- [x] 4.4 Confirm a deliberate type error causes the workflow to fail at the compile step (not silently pass through packaging)
