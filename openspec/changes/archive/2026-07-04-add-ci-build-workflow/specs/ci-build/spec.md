## ADDED Requirements

### Requirement: Build on push to feature branches
The system SHALL run a GitHub Actions build workflow on every push to a branch matching `feature/**`.

#### Scenario: Push to a feature branch
- **WHEN** a commit is pushed to a branch named `feature/<name>` (including nested names like `feature/<name>/<sub>`)
- **THEN** the build workflow runs

### Requirement: Build on push to main
The system SHALL run the same build workflow on every push to `main`, including when a feature branch is merged into `main`.

#### Scenario: Merge lands on main
- **WHEN** a feature branch is merged into `main` and the merge commit is pushed to `main`
- **THEN** the build workflow runs

#### Scenario: No pull_request trigger
- **WHEN** a pull request targeting `main` is opened or updated without a corresponding push to `main` or a `feature/**` branch
- **THEN** the build workflow does not run

### Requirement: Build validates compilation and packaging
The build workflow SHALL install dependencies, run the project's compile step, and run the project's packaging step, in that order, failing the workflow if either step fails.

#### Scenario: Type error in source
- **WHEN** the compile step (`npm run compile`) fails due to a TypeScript type error
- **THEN** the workflow fails before attempting to package the `.vsix`

#### Scenario: Packaging failure
- **WHEN** compilation succeeds but `npm run package:vsix` fails
- **THEN** the workflow fails and no `.vsix` artifact is produced

### Requirement: Downloadable .vsix artifact
The build workflow SHALL upload the packaged `.vsix` file as a downloadable GitHub Actions workflow artifact when the build succeeds.

#### Scenario: Successful build produces downloadable artifact
- **WHEN** `npm run package:vsix` completes successfully and produces a `.vsix` file
- **THEN** that `.vsix` file is uploaded as a workflow artifact retrievable from the workflow run

### Requirement: Pinned Node version
The build workflow SHALL run using Node.js version 24.

#### Scenario: Node version used in build
- **WHEN** the build workflow sets up its Node.js environment
- **THEN** Node.js 24 is used, matching the devcontainer's Node version
