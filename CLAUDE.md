# GitHub Actions workflows

When adding or editing steps in `.github/workflows/*.yml`, don't assume a
version pinned from training data or memory is current — action major
versions bump periodically (e.g. to move off a deprecated Node.js runtime).

The "latest release" isn't a reliable enough check by itself: majors bump
their declared runtime independently (e.g. `actions/checkout@v5` and
`actions/setup-node@v5` already targeted Node 24, but `actions/upload-artifact`
didn't switch until v6). Before committing a workflow change, check the
`runs.using` field in the action's `action.yml` directly, e.g.:

```
curl -s https://raw.githubusercontent.com/<owner>/<repo>/<tag>/action.yml | grep -A1 "^runs:"
```

and pin to the lowest major version that already declares the current
runtime (e.g. `node24`), rather than assuming the latest major is required.

# Git / Commit Conventions

Always create or switch to a feature branch before committing — don't commit
directly to `main`.

# Environment / Prerequisites

Before starting a workflow that depends on external CLIs (`gh`, `node`,
`openspec`), verify they're installed and on `PATH`. If something is missing,
say so rather than letting the task fail partway through.

# Verifying Webview/UI Changes

`npm run compile` (tsc + esbuild) only validates types and bundling — it
gives zero signal about whether CSS/layout actually renders correctly (e.g.
a flex item with `align-items: stretch` but no explicit height on either the
container or the child silently collapses to 0px — no build error, just an
invisible element). Don't report a change under `src/webview/**` or its
`style.css` as complete on the strength of a passing build alone.

Before declaring such a change done, launch the extension and look at the
actual result:

```
code --extensionDevelopmentPath=. --new-window sample-files/valid-sample.dcm
```

(equivalent to the "Run Extension" launch config in `.vscode/launch.json`,
i.e. what F5 does). If a screenshot/UI-inspection tool is available in the
session, use it to check the rendered output directly. If not, say so
explicitly and ask the user to confirm the visual result — don't let a
green build silently stand in for a look at the real thing.
