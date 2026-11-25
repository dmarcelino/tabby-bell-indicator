# Design

## Context

- The repo has no `.github/` folder yet. `main` has a ruleset. There are no tag rules, no environments and no tags. The repo is public.
- `package.json` already has:
  - name `tabby-bell-indicator` and version `0.1.0`;
  - keyword `tabby-plugin`, an `author` and `main: dist/index.js`;
  - `files: [dist, LICENSE, README.md]`.
  It has no `repository`, `homepage` or `bugs` field and no publish-time build script. `dist/` is git-ignored.
- `npm view tabby-bell-indicator` returns 404, so the name is free.
- How Tabby finds plugins (upstream `tabby-plugin-manager`, `app/src/plugins.ts`):
  - It queries `registry.npmjs.com/-/v1/search` for `keywords:tabby-plugin`.
  - It keeps names starting with `tabby-` and takes the highest version.
  - Its loader requires the `tabby-plugin` keyword and an `author`.
- npm trusted publishing (docs.npmjs.com/trusted-publishers and the `npm trust` command page, read 2026-11-24):
  - The package must already exist before a trusted publisher can be set up.
  - A new setup must complete a publish within 2 days.
  - Setups created after 2026-09-03 only allow `npm stage publish` unless `--allow-publish` is given.
  - Requirements: GitHub-hosted runners, `id-token: write`, npm ≥ 11.5.1 and Node ≥ 22.14.
  - `repository.url` must match the repo exactly (case-sensitive).
  - The setup's fields are only checked when you publish.
- npm CLI 11.19.1 source (`lib/utils/oidc.js`):
  - If the trusted-publishing exchange fails, npm returns without touching the configured token, so token auth still works.
  - npm only turns on provenance by itself after a successful trusted-publishing exchange.

## Goals / Non-Goals

**Goals:**
- One release workflow that serves both the token-based 0.1.0 bootstrap and the later releases without a token. Only repo and npm settings change between the two, not the workflow.
- Least privilege. The publish job has no access to installed dev dependencies or to the GitHub write token. The job that writes to GitHub holds no npm credential.
- A failed check never leaves a half-done release. A failure after npm publish can be fixed by re-running the failed job.

**Non-Goals:**
- Automating the GitHub and npm settings (environment, ruleset, secrets, trusted publisher, token policy). They are one-time manual steps, documented in `doc/RELEASING.md`.
- Pre-release or dist-tag channels such as `next`. Every release goes to `latest`.
- Testing on more than one Node version. The plugin runs inside Tabby's Electron, not on a user's Node.

## Decisions

### D1. Trigger: push of a `v*.*.*` tag
The maintainer runs `npm version patch|minor|major`, which commits the bump and creates the tag, then `git push --follow-tags`.

*Alternatives:*
- **Trigger on a published GitHub Release:** that needs an extra UI step, and the GitHub Release should be a result of publishing, not its cause.
- **release-please:** the user decided against it.
- **`workflow_dispatch`:** npm's docs list it as a cause of trusted-publisher mismatches, and it loses the clear link between tag and version.

### D2. Three jobs in `release.yml`
1. **`verify`** (`contents: read`, no secrets):
   - checks out the tag;
   - checks the tag against `package.json` and that npm ≥ 11.5.1;
   - runs `npm ci`, typecheck, test and build;
   - runs `npm pack`, checks the tarball's file list, and uploads the `.tgz` as a workflow artifact.
2. **`publish`** (needs `verify`; `environment: npm`; `id-token: write`, `contents: read`):
   - downloads the tarball;
   - runs `npm publish <tarball> --provenance`.
   It has no checkout, no `npm ci` and runs no repo scripts. Publishing a tarball does not run lifecycle scripts, so `prepublishOnly` doesn't run here.
3. **`github-release`** (needs `publish`; `contents: write`):
   - runs `gh release create "$TAG" --verify-tag --generate-notes`, skipped if the release already exists so a re-run works.

*Why:* the npm-capable job only sees the exact bytes that `verify` checked, and no third-party dev dependency runs while the npm credential is in scope.

*Alternative:* a single job that installs, builds and publishes. Simpler, but every dev dependency's code runs in the job that holds the npm credential.

### D3. Provenance flag passed explicitly
`npm publish --provenance` is needed for the token-based 0.1.0 publish, because npm only adds provenance by itself after a successful trusted-publishing exchange. With trusted publishing the flag is harmless.

*Alternative:* `publishConfig.provenance: true` in `package.json`. That would also make a local, manual publish fail, and `prepublishOnly` exists to make the manual path safe.

### D4. Bootstrap for 0.1.0 with a token kept in the environment
- A granular npm token, limited to publishing and expiring within days, goes into the **`npm` environment's** secret `NPM_TOKEN`. Only the `publish` job can read it, and only for `v*` tags.
- The publish step sets `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. Once the secret is deleted, the value is empty and npm uses trusted publishing.
- Right after 0.1.0 is published, the secret is deleted and the token is revoked on npmjs.com.
- Before 0.1.1, and at most 2 days before tagging it, the maintainer runs:
  `npm trust github tabby-bell-indicator --file release.yml --repo dmarcelino/tabby-bell-indicator --env npm --allow-publish`
  Then they turn on "Require two-factor authentication and disallow tokens" for the package.

*Alternatives:*
- **Manual 0.1.0 from a laptop:** no provenance, and the workflow would first run at 0.1.1.
- **Placeholder 0.0.0 version:** it would stay on npm permanently and could show up in Tabby's list.
The user chose the token bootstrap.

### D5. `npm` environment and tag protection
- **`npm` environment:** a deployment rule that only allows tags matching `v*`. No required reviewers (the user chose publish-on-tag). This is also the environment named in the trusted-publisher setup.
- **Tag ruleset for `refs/tags/v*`:** blocks updating and deleting those tags, with the repo admin on the bypass list. A published version's tag then can't silently move to another commit.

### D6. Toolchain on the runners
- **Node:** `actions/setup-node` with `node-version: 24`. The `publish` job also sets `registry-url: https://registry.npmjs.org`, which writes the `.npmrc` that reads `NODE_AUTH_TOKEN`.
- **npm version check:** a step in `verify` and in `publish` fails if `npm --version` is below 11.5.1. The npm bundled with Node 24 meets this. If a runner ever ships an older npm, the release fails loudly before publishing. The fix is then an explicit `npm install -g npm@11` step, not a silent upgrade.
- **Caching off in setup-node:** both release setup-node steps set `package-manager-cache: false`. setup-node v7 caches automatically when `package.json` names a package manager, and its docs recommend turning that off for publishing workflows.
- **Caching:** `ci.yml` uses setup-node's npm cache. `release.yml` uses no cache, so a poisoned cache from a PR run can't affect a release build.

### D7. Hardening every workflow
- Every third-party action is pinned to a full commit SHA, with the version in a comment. Dependabot (`github-actions`, weekly) keeps them up to date.
- Top-level `permissions: {}` (or `contents: read`), and each job widens only what it needs.
- `actions/checkout` uses `persist-credentials: false`.
- `release.yml` uses `concurrency: release-${{ github.ref }}` with `cancel-in-progress: false`.
- Shell steps get the tag and other GitHub context through `env:`, never through inline `${{ }}` inside `run:`.

### D8. CI matrix
`ci.yml` runs on `pull_request` and on `push` to `main`, with a matrix of `ubuntu-latest`, `macos-latest` and `windows-latest`. Each job runs `npm ci`, typecheck, test and build. `fail-fast: false`, so a failure on one OS doesn't hide the result on the others. This enforces AGENTS.md's "works on every OS" for the parts that can be checked without Tabby.

### D9. `package.json` changes
- `repository`: `{ "type": "git", "url": "git+https://github.com/dmarcelino/tabby-bell-indicator.git" }`. This matches what npm writes itself, and npm's provenance check normalises it to the GitHub repo URL.
- `homepage`: the repo's `#readme` URL.
- `bugs`: the repo's `/issues` URL.
- `scripts.prepublishOnly`: `npm run build`.
- No `publishConfig.access`, because unscoped packages are public by default.

### D10. SPDX headers
New YAML files get `# SPDX-License-Identifier: MIT` like the other config files (`webpack.config.mjs`). Markdown files don't, which matches `README.md` and `doc/TESTING.md`.

## Risks / Trade-offs

- **[Risk] `repository.url` doesn't match exactly, so the provenance check fails at publish.**
  → Use the exact form above. The 0.1.0 bootstrap runs the same check, so a mismatch shows up on the first release, not later.
- **[Risk] The trusted-publisher setup doesn't match the workflow file or environment name, and npm only checks at publish.**
  → `doc/RELEASING.md` gives the exact command. With tokens disallowed, a mismatched 0.1.1 publish fails cleanly and nothing is published. Fix the setup and re-run the `publish` job.
- **[Risk] The trusted-publisher setup expires (2-day window) before 0.1.1 is tagged.**
  → Set it up only when 0.1.1 is ready. If it expires, delete and set it up again.
- **[Risk] Publishing a tarball with trusted publishing or provenance behaves differently from publishing a folder.**
  → The 0.1.0 bootstrap checks provenance on the tarball path. If the token-free 0.1.1 publish rejects the tarball, the fallback is to publish from a checkout of the tag in the `publish` job, still without running `npm ci`.
- **[Risk] npm publish succeeds but the GitHub Release step fails.**
  → That step can be re-run (D2). An npm version can never be published twice, so the `publish` job is never re-run after it succeeded.
- **[Risk] A bad version reaches npm.**
  → Fix forward with a patch release. Use `npm deprecate` on the bad version. Unpublishing is limited to 72 hours and frees nothing up, because a version number can never be reused.
- **[Trade-off] No approval gate between the tag and npm.** The maintainer's tag push is the approval. Tag protection (D5) and trusted publishing limit who can trigger a release.
- **[Trade-off] Tabby's listing isn't checked in CI.** It depends on npm's search index, which can lag by minutes to hours. It is checked by hand after each release and recorded in `doc/TESTING.md`.

## Migration Plan

1. Merge this change. CI runs on the PR.
2. One-time GitHub setup:
   - create the `npm` environment with the `v*` tag rule;
   - add the tag ruleset;
   - add the bootstrap `NPM_TOKEN` to the `npm` environment.
3. Push `v0.1.0`: `npm version` isn't needed because the version is already 0.1.0, so create the tag with `git tag v0.1.0`. The workflow publishes 0.1.0 with provenance and creates the GitHub Release.
4. Delete the `NPM_TOKEN` secret and revoke the token.
5. Check npmjs.com (provenance badge). Check that Tabby's plugin manager lists and installs the plugin. Record the result in `doc/TESTING.md`.
6. Before 0.1.1: set up trusted publishing with `npm trust github …`, then turn on "disallow tokens" for the package.

Rollback: delete the workflows to stop releases. Published versions stay on npm. Handle them with `npm deprecate` or fix forward.
