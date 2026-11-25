# Spec Delta

## Purpose

Defines how the plugin is checked, packaged and published to npm, so that Tabby's plugin manager can list and install it, and so that every published version can be traced to its source commit.

## ADDED Requirements

### Requirement: Package is discoverable by Tabby's plugin manager
The published npm package SHALL be public, SHALL be named with the `tabby-` prefix, and SHALL include the `tabby-plugin` keyword, an `author` field and a `main` entry that resolves to the built plugin module.

#### Scenario: Plugin appears in Tabby's plugin list
- **WHEN** a version of the package has been published and npm's search index includes it
- **THEN** searching for "bell-indicator" in Tabby's plugin manager (Settings → Plugins) lists `bell-indicator` with that version, and installing it loads the plugin after a restart

### Requirement: Published package contents
Each published package SHALL contain the built plugin bundle (`dist/index.js`), `LICENSE`, `README.md` and `package.json`. It SHALL NOT contain source files, tests or Tabby, Angular or RxJS code.

#### Scenario: Package contents are checked before publishing
- **WHEN** the release workflow packs the package
- **THEN** it fails without publishing if `dist/index.js`, `LICENSE` or `README.md` is missing

#### Scenario: Manual publish from a clean checkout
- **WHEN** someone runs `npm publish` in a checkout with no `dist/` folder
- **THEN** the plugin is built before the package is packed

### Requirement: Package metadata points to the source repository
`package.json` SHALL declare the GitHub repository, homepage and issue tracker. The repository URL SHALL exactly match the GitHub repository the package is published from.

#### Scenario: npm page links to the source
- **WHEN** a user opens the package page on npmjs.com
- **THEN** it links to the GitHub repository and its issue tracker

### Requirement: Continuous integration checks
Every pull request and every push to `main` SHALL run typecheck, unit tests and build on Linux, macOS and Windows. A failure on any of them SHALL mark the check as failed.

#### Scenario: Pull request with a failing test
- **WHEN** a pull request makes a unit test fail on any of the three operating systems
- **THEN** the CI check on that pull request reports failure

#### Scenario: Pull request with passing checks
- **WHEN** typecheck, tests and build pass on all three operating systems
- **THEN** the CI check reports success

### Requirement: Release is triggered by a version tag
Pushing a tag of the form `vX.Y.Z` SHALL start a release of version `X.Y.Z`. No other event SHALL publish to npm.

#### Scenario: Version tag pushed
- **WHEN** the maintainer pushes tag `v0.1.1` on a commit whose `package.json` version is `0.1.1`
- **THEN** the release workflow runs checks, publishes `tabby-bell-indicator@0.1.1` to npm and creates the GitHub Release `v0.1.1`

#### Scenario: Push without a version tag
- **WHEN** commits are pushed to any branch, or a pull request is opened, without a `vX.Y.Z` tag
- **THEN** nothing is published

### Requirement: Tag must match the package version
The release SHALL publish only if the tag without its leading `v` equals the `version` in `package.json` at the tagged commit.

#### Scenario: Tag and version disagree
- **WHEN** tag `v0.2.0` is pushed on a commit whose `package.json` version is `0.1.1`
- **THEN** the release workflow fails before publishing and nothing is published to npm or GitHub Releases

### Requirement: Release publishes only after checks pass
The release workflow SHALL run typecheck, unit tests, build and the package-contents check on the tagged commit, and SHALL publish only if all of them pass.

#### Scenario: Tagged commit fails its tests
- **WHEN** a version tag points to a commit whose unit tests fail
- **THEN** the release workflow fails and nothing is published

### Requirement: Published versions carry provenance
Each version published by the release workflow SHALL include an npm provenance statement that links it to the source repository, the workflow and the tagged commit.

#### Scenario: Provenance visible on npm
- **WHEN** a version has been published by the release workflow
- **THEN** its npmjs.com page shows provenance pointing to `dmarcelino/tabby-bell-indicator`, the release workflow and the tagged commit

### Requirement: Publishing credentials
After the first release, npm publishing SHALL use trusted publishing tied to the release workflow and the `npm` GitHub environment. The package SHALL then refuse publishing with tokens. No long-lived npm token SHALL be stored in the repository or its settings.

#### Scenario: Release after the bootstrap
- **WHEN** a version after 0.1.0 is released
- **THEN** the workflow publishes without any npm token secret

#### Scenario: Attempt to publish with a token
- **WHEN** someone tries to publish a new version with an npm access token after trusted publishing is set up
- **THEN** npm rejects the publish

### Requirement: GitHub Release for each version
Each successful publish SHALL be followed by a GitHub Release named after the tag, with release notes generated from the changes since the previous release.

#### Scenario: Release notes created
- **WHEN** version `0.1.1` is published
- **THEN** a GitHub Release `v0.1.1` exists with generated notes that list the merged pull requests since `v0.1.0`
