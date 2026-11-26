# Releasing

How the plugin is published to npm, and how its project page at https://tabby-bell-indicator.dariomarcelino.com is deployed, for the maintainer. Tabby's plugin manager finds plugins by searching npm for the keyword `tabby-plugin`, and lists this one as `bell-indicator`. A version that isn't on npm can't be installed from Tabby.

## How a release runs

Pushing a tag `vX.Y.Z` starts `.github/workflows/release.yml`. It has four jobs. Each starts after the job it depends on passed:

1. **`verify`** checks that the tag equals `v` + the `version` in `package.json`, then runs typecheck, tests and build. It packs the package, checks the tarball's contents and keeps the tarball for the next job. It has no secrets.
2. **`publish`** runs in the GitHub environment `npm`. It runs `npm publish <tarball> --provenance --access public` on the exact tarball that `verify` checked. It reads the environment secret `NPM_TOKEN` as `NODE_AUTH_TOKEN`. When that secret doesn't exist, npm uses trusted publishing instead.
3. **`github-release`** (after `publish`) creates the GitHub Release for the tag, with generated notes. If the release already exists, it does nothing.
4. **`pages`** (after `publish`, next to `github-release`) runs `.github/workflows/pages.yml`: it builds the project page from the tag's `README.md` and deploys it to GitHub Pages. Links on the page to repo files point to the tag. It has no npm credentials.

Three rules follow from this:
- `github-release` and `pages` can be re-run safely.
- Never re-run `publish` after it succeeded. npm never accepts the same version twice.
- A release that fails before `publish` leaves the page as it was.

`.github/workflows/ci.yml` runs typecheck, tests, build and the page build (`npm run site`) on Linux, macOS and Windows for every pull request and every push to `main`. It never publishes or deploys.

## Project page

The page is generated from `README.md` by `site/build.mjs`, with the template and stylesheet in `site/`. To preview it, run `npm run site` and open `_site/index.html` in a browser. `SITE_REF=<ref>` sets the git ref that links to repo files point to; it defaults to `main`.

Besides each release, the page can be deployed by hand, for example after a styling fix: Actions → Pages → Run workflow, or with `gh`:

```sh
gh workflow run pages.yml --ref v<latest version>
gh run watch   # pick the Pages run
```

Run it on the latest release tag, so the page keeps describing the version on npm. Only tags that contain `pages.yml` can be used, which excludes `v0.1.0`. Running it on `main` also works, but the page then shows `main`'s README, including anything not released yet. The `github-pages` environment refuses any other branch.

## One-time setup

Do these once, before the first release. The `gh` commands are an alternative to the GitHub UI; they are written for bash or zsh.

### npm account

Turn on two-factor authentication (2FA) for your npmjs.com account: profile picture → Account → Two-Factor Authentication. See [npm's guide](https://docs.npmjs.com/configuring-two-factor-authentication). `npm trust` and the "disallow tokens" setting below need it.

### GitHub environment `npm`

Only release tags may use this environment, so only they can reach the npm credentials. There are no required reviewers: pushing the tag is the approval.

In the GitHub UI:
1. Repo Settings → Environments → New environment. Name it `npm` and click Configure environment.
2. Leave Required reviewers off.
3. Under deployment branches, choose selected branches and tags. Click Add deployment branch or tag rule, set Ref type to Tag and the pattern to `v*`.

With `gh`:

```sh
gh api -X PUT repos/dmarcelino/tabby-bell-indicator/environments/npm \
  -F 'deployment_branch_policy[protected_branches]=false' \
  -F 'deployment_branch_policy[custom_branch_policies]=true'
gh api -X POST repos/dmarcelino/tabby-bell-indicator/environments/npm/deployment-branch-policies \
  -f name='v*' -f type=tag
```

Check: `gh api repos/dmarcelino/tabby-bell-indicator/environments/npm/deployment-branch-policies` lists one policy, `v*` of type `tag`.

### Tag ruleset for `v*`

A published version's tag must not move to another commit or disappear. The ruleset blocks updating and deleting `v*` tags. Repository admins can bypass it, for the rare case described under [When something fails](#when-something-fails). Creating tags stays allowed.

In the GitHub UI:
1. Repo Settings → Rules → Rulesets → New ruleset → New tag ruleset.
2. Name it, for example `Release tags`, and set Enforcement status to Active.
3. Bypass list: Add bypass, then the repository admin role.
4. Target tags: add a target that includes the pattern `v*`.
5. Rules: turn on Restrict updates and Restrict deletions. Leave the others off.
6. Click Create.

With `gh`:

```sh
gh api -X POST repos/dmarcelino/tabby-bell-indicator/rulesets --input - <<'EOF'
{
  "name": "Release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [
    { "type": "update", "parameters": { "update_allows_fetch_and_merge": false } },
    { "type": "deletion" }
  ],
  "bypass_actors": [
    { "actor_type": "RepositoryRole", "actor_id": 5, "bypass_mode": "always" }
  ]
}
EOF
```

`actor_id` 5 is the repository admin role. The ruleset on `main` uses the same value.

Check: `gh api repos/dmarcelino/tabby-bell-indicator/rulesets` lists the tag ruleset next to the one for `main`.

### Project page: domain, DNS and GitHub Pages

The page is served from `tabby-bell-indicator.dariomarcelino.com`. DNS for `dariomarcelino.com` is at Porkbun.

1. **Verify the domain** on your GitHub account, so no other account can use it for GitHub Pages: profile picture → Settings → Pages → Add a domain, enter `dariomarcelino.com`. GitHub shows a TXT record (`_github-pages-challenge-dmarcelino`) and its value.
2. **Add the DNS records** at Porkbun (Domain Management → `dariomarcelino.com` → DNS, or its API):

   | Type | Host | Answer | TTL |
   |---|---|---|---|
   | TXT | `_github-pages-challenge-dmarcelino` | the value from step 1 | 600 |
   | CNAME | `tabby-bell-indicator` | `dmarcelino.github.io` | 600 |

   Check: `dig +short tabby-bell-indicator.dariomarcelino.com` prints `dmarcelino.github.io.` and four `185.199.x.153` addresses.
3. **Click Verify** in GitHub's Pages settings.
4. **Turn on Pages**, deployed by GitHub Actions: repo Settings → Pages → Source: GitHub Actions. Or:

   ```sh
   gh api -X POST repos/dmarcelino/tabby-bell-indicator/pages -f build_type=workflow
   ```

   This creates the `github-pages` environment, which allows deploys from `main`.
5. **Allow release tags to deploy**, so the release's `pages` job can: Settings → Environments → `github-pages` → Add deployment branch or tag rule, Ref type Tag, pattern `v*`. Or:

   ```sh
   gh api -X POST repos/dmarcelino/tabby-bell-indicator/environments/github-pages/deployment-branch-policies \
     -f name='v*' -f type=tag
   ```

   Check: `gh api repos/dmarcelino/tabby-bell-indicator/environments/github-pages/deployment-branch-policies` lists the `main` branch and the `v*` tag.
6. **Set the custom domain**: Settings → Pages → Custom domain. Or:

   ```sh
   gh api -X PUT repos/dmarcelino/tabby-bell-indicator/pages -f cname=tabby-bell-indicator.dariomarcelino.com
   ```

   No `CNAME` file is needed: deploys from a workflow ignore it.
7. **Deploy once** by hand (see [Project page](#project-page)). Once GitHub has issued the certificate, which can take up to an hour, **enforce HTTPS**: Settings → Pages → Enforce HTTPS. Or:

   ```sh
   gh api -X PUT repos/dmarcelino/tabby-bell-indicator/pages -F https_enforced=true
   ```

   Check: `curl -sI http://tabby-bell-indicator.dariomarcelino.com/` redirects to `https://`.

To take the page down: turn off Pages (Settings → Pages → Unpublish site, or `gh api -X DELETE repos/dmarcelino/tabby-bell-indicator/pages`), then delete the CNAME record at Porkbun. Never leave the CNAME pointing to GitHub without a site behind it. Releases to npm don't depend on the page.

## First release: 0.1.0

npm's trusted publishing can only be set up for a package that already exists. So 0.1.0 is published by the same workflow with a short-lived npm token, which is revoked right after. `package.json` is already at 0.1.0, so there is no `npm version` step.

npm has announced that publishing directly with such a token ends in January 2027 ([npm roadmap](https://github.com/orgs/community/discussions/208130)). Do the bootstrap before then, or check npm's current guidance first.

1. Merge the release pipeline to `main` and check that `ci.yml` passed.
2. Create a granular access token on npmjs.com: profile picture → Access Tokens → Generate New Token ([npm docs](https://docs.npmjs.com/creating-and-viewing-access-tokens)).
   - Name: something that says what it is for, for example `tabby-bell-indicator 0.1.0 bootstrap`.
   - Bypass two-factor authentication: on. The workflow can't answer a 2FA prompt.
   - Packages and scopes: permission Read and write (publish and stage), not the stage-only option. The package doesn't exist on npm yet, so you may not be able to select it by name. Then choose all packages, and keep the expiry short.
   - Organizations: no access.
   - Expiration: the shortest npm allows (at least one day ahead).

   Copy the token. npm shows it only once.
3. Store it as the `npm` environment's secret. Run this in the repo folder and paste the token at the prompt, so it never lands in your shell history:

   ```sh
   gh secret set NPM_TOKEN --env npm
   ```
4. Tag the merge commit on `main` and push the tag:

   ```sh
   git switch main
   git pull --ff-only
   git log -1 --oneline   # must be the merge commit of the release pipeline
   git tag v0.1.0
   git push origin v0.1.0
   ```
5. Watch the run: `gh run watch` and pick the Release run.
6. As soon as `publish` has passed, remove the token, even if `github-release` failed:

   ```sh
   gh secret delete NPM_TOKEN --env npm
   ```

   Then revoke the token on npmjs.com: profile picture → Access Tokens, then delete it from the list ([npm docs](https://docs.npmjs.com/revoking-access-tokens)). Revoking can take up to an hour to take effect.

   Check: `gh secret list --env npm` lists nothing, and the token is gone from npmjs.com's token list.
7. Do the checks in [After each release](#after-each-release).

If `verify` or `publish` fails, nothing is published. See [When something fails](#when-something-fails). Mind the token's expiry if the fix takes long.

## Before 0.1.1: trusted publishing

From 0.1.1 on, the workflow publishes without a token. npm checks instead that the publish comes from `release.yml` in this repo, in the `npm` environment.

1. A new trusted publisher setup must complete a successful publish within 2 days, or it expires and can't be used. So do this when 0.1.1 is ready, at most 2 days before tagging it.
2. You need npm 11.15.0 or later locally, and to be logged in to npmjs.com with `npm login`. A token with "bypass 2FA" can't run `npm trust`. npm asks for 2FA when you run:

   ```sh
   npm trust github tabby-bell-indicator --file release.yml --repo dmarcelino/tabby-bell-indicator --env npm --allow-publish
   ```

   - `--file` is the workflow's file name only, not its path.
   - `--env` must match the GitHub environment.
   - `--allow-publish` lets the workflow run `npm publish`. Without a permission flag, npm refuses to create the setup.

   Check: `npm trust list tabby-bell-indicator` shows the setup.
3. On npmjs.com, open the package's Settings. Under Publishing access, choose "Require two-factor authentication and disallow tokens" and click Update Package Settings. Trusted publishing keeps working. Any publish with a token is rejected.
4. Check that `gh secret list --env npm` lists no `NPM_TOKEN`.
5. Release 0.1.1 as in [Each release](#each-release). Check that it has provenance.

If the 2 days pass before 0.1.1 is published, remove the setup and create it again. npm allows one setup per package:

```sh
npm trust list tabby-bell-indicator               # shows the setup's ID
npm trust revoke tabby-bell-indicator --id <id>
```

Then run the `npm trust github …` command again.

## Each release

1. Start from an up-to-date `main` with a clean working tree:

   ```sh
   git switch main
   git pull --ff-only
   npm version patch   # or minor, or major
   git push --follow-tags
   ```

   `npm version` updates `package.json` and `package-lock.json`, commits the change and creates the tag `vX.Y.Z`. `git push --follow-tags` pushes the commit to `main` and the tag with it.
2. Watch the run: `gh run watch` and pick the Release run.
3. Do the checks in [After each release](#after-each-release).

## After each release

- `npm view tabby-bell-indicator version` prints the new version.
- The version's page on npmjs.com (`https://www.npmjs.com/package/tabby-bell-indicator/v/<version>`) shows provenance. It must point to `dmarcelino/tabby-bell-indicator`, `.github/workflows/release.yml` and the tagged commit.
- `gh release view v<version>` shows the GitHub Release with generated notes.
- https://tabby-bell-indicator.dariomarcelino.com shows the new README, and its links to repo files point to `v<version>`.
- In Tabby, Settings → Plugins, search `bell-indicator`. Check that the new version is listed, install or update it, and restart Tabby. `log.txt` must contain `tabby-bell-indicator: plugin loaded`, and a bell must show the icon. The listing depends on npm's search index and can take a while.

Record the result in [`TESTING.md`](TESTING.md):
- date;
- Tabby version;
- OS;
- how long it took until the version was listed.

If it isn't listed yet, record that instead.

## When something fails

### `verify` fails

Nothing was published to npm or GitHub Releases. The tag exists, though, and the ruleset stops it from being moved. Two ways forward:

- **Release the next patch version (default).** Fix the problem on `main`, then `npm version patch` and push as usual. The failed tag stays and points to a version that was never published. That costs a version number, but nothing is rewritten.
- **Move the tag, using the admin bypass.** Fix the problem on `main` in a commit after the version bump, so `package.json` still has the same version. Then delete and recreate the tag:

  ```sh
  git push origin --delete v<version>
  git tag -d v<version>
  git tag v<version> <fixed-commit>
  git push origin v<version>
  ```

  This keeps the version numbers without a gap. But it moves a tag that others may already have fetched, and it is exactly what the ruleset exists to prevent. Only do it when `npm view tabby-bell-indicator@<version> version` prints nothing, that is, the version is not on npm.

### `github-release` fails

The version is on npm. Re-run only this job: in the run's page on GitHub, use the re-run icon next to `github-release`. With `gh`:

```sh
gh run view <run-id> --json jobs --jq '.jobs[] | {name, databaseId}'
gh run rerun --job <databaseId>
```

Don't use "Re-run all jobs": it would run `publish` again. GitHub allows re-runs for 30 days. After that, create the release by hand: `gh release create v<version> --verify-tag --generate-notes`.

### `pages` fails

The version is on npm; only the page is behind. Re-run only the `pages` job, the same way as for `github-release` above, or deploy by hand with `gh workflow run pages.yml --ref v<version>`. Don't use "Re-run all jobs".

If the deploy is refused with "not allowed to deploy to github-pages due to environment protection rules", the `v*` tag rule on the `github-pages` environment is missing. See [Project page: domain, DNS and GitHub Pages](#project-page-domain-dns-and-github-pages).

### `publish` fails

First check whether the version reached npm: `npm view tabby-bell-indicator@<version> version`.

- **It is on npm:** don't re-run anything. Create the GitHub Release by hand: `gh release create v<version> --verify-tag --generate-notes`, and deploy the page by hand: `gh workflow run pages.yml --ref v<version>`.
- **It is not on npm, and the error is about authentication or trusted publishing:** the npm setup doesn't match the workflow. Compare `npm trust list tabby-bell-indicator` with: repo `dmarcelino/tabby-bell-indicator`, file `release.yml`, environment `npm`. Fix it by revoking the setup and creating it again (see [Before 0.1.1](#before-011-trusted-publishing)). Then re-run the failed jobs: `gh run rerun <run-id> --failed`, or "Re-run failed jobs" on GitHub. That runs `publish` and then `github-release` and `pages`. If `publish` can't find the package artifact, for example because it has expired, use "Re-run all jobs": nothing was published, so that is safe.
- **Any other error with nothing on npm:** fix the cause on `main` and handle it like a failed `verify`.

### A bad version was published

A version number can never be used again, even after unpublishing, and npm only allows unpublishing in limited cases ([npm unpublish policy](https://docs.npmjs.com/policies/unpublish)). So fix forward:

1. Mark the bad version:

   ```sh
   npm deprecate tabby-bell-indicator@<version> "<reason>"
   ```

   npm then warns anyone who installs that version.
2. Fix the problem on `main` and release the next patch version. Tabby's plugin manager offers the latest version on npm, so the fix replaces the bad version there.
