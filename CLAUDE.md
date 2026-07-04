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
