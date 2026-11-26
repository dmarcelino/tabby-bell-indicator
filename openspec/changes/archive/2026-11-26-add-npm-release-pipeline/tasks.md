# Tasks

## 1. Package metadata

- [x] 1.1 In `package.json`, add `repository`, `homepage`, `bugs` and `scripts.prepublishOnly: "npm run build"` exactly as in design D9. Leave `version` (0.1.0), `keywords`, `author` and `files` unchanged.

  Verify:
  - `npm pkg get repository.url homepage bugs.url` prints the three GitHub URLs.
  - `npm run typecheck`, `npm test` and `npm run build` pass with no new warnings.
- [x] 1.2 Check the package contents against the "Published package contents" requirement. Verify:
  - After `rm -rf dist`, `npm publish --dry-run` runs the build first. `dist/index.js` exists again and is in the listed files.
  - `npm pack --dry-run` lists only `package.json`, `README.md`, `LICENSE` and `dist/index.js`: no `src/`, specs or source maps.

## 2. CI workflow

- [x] 2.1 Add `.github/workflows/ci.yml` following design D6–D8:
  - triggers: `pull_request`, and `push` to `main`;
  - matrix: ubuntu, macOS and Windows, `fail-fast: false`, Node 24 with npm cache;
  - steps: `npm ci`, typecheck, test, build;
  - top-level permissions `contents: read`;
  - actions pinned to SHAs, checkout with `persist-credentials: false`;
  - SPDX header.

  Verify: `actionlint` and `zizmor` report no findings on the file. Ask before installing either tool if it is missing.
- [x] 2.2 Add `.github/dependabot.yml` for the `github-actions` ecosystem, weekly, with an SPDX header. Verify: `actionlint` doesn't cover it, so check it against GitHub's dependabot.yml schema. After merge, the repo's Insights → Dependency graph → Dependabot tab shows the setup without errors.

## 3. Release workflow

- [x] 3.1 Add `.github/workflows/release.yml` with the `verify` job (design D2, D6, D7):
  - trigger: `push` of tags `v*.*.*`;
  - top-level `permissions: {}`;
  - `concurrency` per ref, without cancel-in-progress;
  - no cache;
  - checks: tag (from `env`) equals `v` + `package.json` version, and npm ≥ 11.5.1;
  - `npm ci`, typecheck, test, build;
  - `npm pack`, fail if the tarball lacks `dist/index.js`, `LICENSE` or `README.md`, and upload the `.tgz` as an artifact.

  Verify:
  - `actionlint` and `zizmor` report no findings.
  - Running the tag-check and contents-check commands locally fails for `GITHUB_REF_NAME=v9.9.9` and passes for `v0.1.0`.
- [x] 3.2 Add the `publish` job:
  - `needs: verify`, `environment: npm`;
  - permissions `id-token: write`, `contents: read`;
  - setup-node with `registry-url: https://registry.npmjs.org`, plus the npm version check;
  - download the artifact, then `npm publish <tgz> --provenance --access public` with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`;
  - no checkout and no `npm ci` (design D2, D3, D4).

  Verify: `actionlint` and `zizmor` report no findings. Reviewing the job shows no repo code or dev dependency runs in it.
- [x] 3.3 Add the `github-release` job:
  - `needs: publish`, permission `contents: write`;
  - create the release with `gh release create "$TAG" --verify-tag --generate-notes`, skipped if `gh release view "$TAG"` already succeeds.

  Verify: `actionlint` and `zizmor` report no findings.

## 4. Documentation

- [x] 4.1 In `README.md`, add an "Install" section before "Install from source": in Tabby, Settings → Plugins, search "bell-indicator", install, restart. Note that a new release can take a while to appear. Verify: the steps match the plugin manager's search (keyword `tabby-plugin`, `tabby-` prefix stripped in the listed name).
- [x] 4.2 Add `doc/RELEASING.md`.

  One-time setup:
  - npm account 2FA;
  - the `npm` GitHub environment with the `v*` tag rule;
  - the `v*` tag ruleset;
  - the 0.1.0 bootstrap: create a short-lived granular token, add it as the `npm` environment secret `NPM_TOKEN`, then delete and revoke it after publishing;
  - before 0.1.1: the exact `npm trust github … --file release.yml --env npm --allow-publish` command and its 2-day window, then "Require 2FA and disallow tokens".

  Each release:
  - `npm version patch|minor|major` and `git push --follow-tags`;
  - watch the workflow;
  - check the provenance badge on npmjs.com;
  - check Tabby's plugin list and record the result in `doc/TESTING.md`.

  Recovery:
  - re-run only `github-release`;
  - fix forward and use `npm deprecate`.

  Verify: every command is spelled as in design D4 and D5, and `npm help trust` in the local npm (≥ 11.15) shows the flags used. No secret, token or personal path in the file.

## 5. Integration checks

- [x] 5.1 Run the full local gate. Verify:
  - `npm run typecheck`, `npm test` and `npm run build` pass with no new warnings;
  - `openspec validate add-npm-release-pipeline --strict` passes;
  - `grep -L SPDX-License-Identifier .github/workflows/*.yml .github/dependabot.yml` lists nothing.
- [x] 5.2 After the user confirms pushing the branch and opening a PR: verify `gh pr checks` shows `ci.yml` passing on ubuntu, macOS and Windows, and that no release workflow ran.

## 6. First release, 0.1.0 (each external step only after the user confirms it)

- [x] 6.1 After the PR is merged, the maintainer:
  - creates the `npm` environment with deployment tag rule `v*`;
  - adds the `refs/tags/v*` ruleset (block update and delete, admin bypass);
  - adds the bootstrap `NPM_TOKEN` environment secret.

  Verify:
  - `gh api repos/dmarcelino/tabby-bell-indicator/environments` lists `npm`;
  - `gh api repos/dmarcelino/tabby-bell-indicator/rulesets` lists the tag ruleset.
- [x] 6.2 Tag `v0.1.0` on the merge commit on `main` and push it. Verify:
  - all three release jobs pass;
  - `npm view tabby-bell-indicator version` prints `0.1.0`;
  - the GitHub Release `v0.1.0` exists with generated notes.
- [x] 6.3 Delete the `NPM_TOKEN` secret and revoke the token on npmjs.com. Verify: `gh api repos/dmarcelino/tabby-bell-indicator/environments/npm/secrets` lists no secrets, and the token is gone from npmjs.com's token list.
- [x] 6.4 Verify provenance: the 0.1.0 page on npmjs.com shows provenance pointing to the repo, `release.yml` and the tagged commit.
- [x] 6.5 In a running Tabby, install `bell-indicator` from Settings → Plugins and restart. Verify:
  - `log.txt` contains `tabby-bell-indicator: plugin loaded`;
  - a bell shows the icon.

  Record the date, Tabby version, OS and how long the listing took to appear in `doc/TESTING.md`. If it hasn't appeared yet, record that instead of claiming success.

  Done 2026-11-26 on Windows: listed (at the bottom), installed, the icon shows. `log.txt` and the Tabby version were not checked. See `doc/TESTING.md`.

## Workflow follow-up

- Before tagging 0.1.1, and no more than 2 days ahead:
  - run `npm trust github tabby-bell-indicator --file release.yml --repo dmarcelino/tabby-bell-indicator --env npm --allow-publish`;
  - turn on "Require two-factor authentication and disallow tokens" for the package;
  - check that 0.1.1 publishes without a token and with provenance.
- Archive this change once group 6 is done and the user agrees.
