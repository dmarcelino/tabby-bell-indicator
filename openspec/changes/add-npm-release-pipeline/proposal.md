# Proposal

## Why

Users can only install the plugin today by cloning the repo, building it and linking it into Tabby's plugins folder by hand. Tabby's plugin manager (Settings → Plugins) lists third-party plugins by searching the public npm registry for the `tabby-plugin` keyword and a `tabby-` name prefix. To show up there, the plugin has to be published to npm. A release pipeline makes each release repeatable, checked and traceable to its source commit, instead of depending on a build on someone's laptop.

## What Changes

- First public release, **0.1.0**, published to npm as `tabby-bell-indicator`. The version in `package.json` is already 0.1.0, so it is not bumped.
- `package.json` gets the metadata that npm, provenance and the Tabby listing need:
  - `repository`, matching the GitHub repo exactly;
  - `homepage` and `bugs`;
  - a `prepublishOnly` build, so a manual publish can't ship without `dist/`.
- A CI workflow runs typecheck, tests and build on Linux, macOS and Windows for every pull request and every push to `main`.
- A release workflow runs when a `vX.Y.Z` tag is pushed. It:
  1. checks that the tag matches `package.json`;
  2. runs the same checks and checks the package contents;
  3. publishes to npm with a provenance statement;
  4. creates a GitHub Release with generated notes.
  It publishes without manual approval, from a GitHub environment that only release tags can use.
- npm authentication:
  - **0.1.0:** npm's trusted publishing (publishing from GitHub Actions without a stored token) can only be set up for a package that already exists. So 0.1.0 is published by the same workflow with a short-lived npm token, which is revoked right after.
  - **From 0.1.1 on:** releases use trusted publishing, and token publishing is turned off on the package.
- Dependabot keeps the pinned GitHub Actions up to date.
- Docs:
  - the README explains how to install from Tabby's plugin manager;
  - a new `doc/RELEASING.md` covers the one-time npm and GitHub setup and the steps for each release.

Not in scope:
- a `CHANGELOG.md` file;
- release-please or other release bots;
- publishing to any registry other than npm;
- changes to the plugin's behaviour.

## Capabilities

### New Capabilities
- `plugin-release`: how the plugin is checked, packaged and published to npm so Tabby's plugin manager can list and install it, and how a release is triggered and traced to its source.

### Modified Capabilities
<!-- None: the plugin's runtime behaviour (tab-bell-indicator) is unchanged. -->

## Impact

- **Repo files:**
  - changed: `package.json`, `README.md`;
  - new: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`, `doc/RELEASING.md`.
- **External systems:**
  - the npm registry: a new public package, its trusted-publisher setup and its publishing-access setting;
  - GitHub: Actions, an `npm` environment, a ruleset protecting `v*` tags, and a temporary repository secret for the first publish.
  These settings are made by the maintainer, or by an agent only after the maintainer confirms. They are documented in the repo, not automated.
- **Runtime:** no change to the plugin code or bundle. Tabby users get a new install path through the plugin manager.
- **Dependencies:** none added. The workflows use GitHub-hosted runners, Node 24 and npm ≥ 11.5.1.
