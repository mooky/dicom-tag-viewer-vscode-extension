# GitHub Actions workflows

When adding or editing steps in `.github/workflows/*.yml`, don't assume a
version pinned from training data or memory is current — action major
versions bump periodically (e.g. to move off a deprecated Node.js runtime).
Before committing a workflow change, check the action's latest release
(`gh api repos/<owner>/<repo>/releases/latest` or the Marketplace page) and
pin to the current major version.
