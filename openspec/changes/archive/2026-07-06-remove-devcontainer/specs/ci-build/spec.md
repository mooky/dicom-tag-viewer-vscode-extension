## MODIFIED Requirements

### Requirement: Pinned Node version

The build workflow SHALL run using Node.js version 24.

#### Scenario: Node version used in build

- **WHEN** the build workflow sets up its Node.js environment
- **THEN** Node.js 24 is used, matching the Node version documented for local development in `README.md`
