# Tasks

Tasks marked **[Maintainer]** need the maintainer: a web UI, a merge or a decision. Tasks marked **[Agent]** that change something outside the repo (DNS, GitHub settings, a deploy) are shown to the maintainer as exact commands and run only after they confirm.

## 1. Domain, DNS and GitHub Pages setup

- [x] 1.1 **[Maintainer]** Start verifying `dariomarcelino.com` on the GitHub account: avatar → Settings → Pages → Add a domain. Paste the TXT record's name and value into the conversation (the value is not secret). Verify: the TXT name and value are in the conversation.
- [x] 1.2 **[Agent]** With the keys from `~/.config/porkbun/credentials.env` (loaded into the shell, never printed or put on a command line), as in design D6:
  - call `/ping` and confirm the key works;
  - confirm `dariomarcelino.com` has no existing TXT record with the verification name and no record named `tabby-bell-indicator`;
  - after the maintainer confirms the exact records, create the TXT record from 1.1 and CNAME `tabby-bell-indicator` → `dmarcelino.github.io` (TTL 600).

  Verify: `dig +short TXT <verification name>.dariomarcelino.com` prints the value; `dig +short tabby-bell-indicator.dariomarcelino.com` prints `dmarcelino.github.io.` and the four `185.199.x.153` addresses.
- [ ] 1.3 **[Maintainer]** Click Verify for `dariomarcelino.com` in GitHub's Pages settings. Verify: GitHub lists the domain as verified.
- [x] 1.4 **[Agent]** Turn on Pages for the repo with `build_type: workflow` (`gh api -X POST repos/dmarcelino/tabby-bell-indicator/pages -f build_type=workflow`). Verify: `gh api repos/dmarcelino/tabby-bell-indicator/pages --jq .build_type` prints `workflow`, and the `github-pages` environment exists.
- [x] 1.5 **[Agent]** Add a deployment rule for tags matching `v*` to the `github-pages` environment (design D5). Verify: `gh api repos/dmarcelino/tabby-bell-indicator/environments/github-pages/deployment-branch-policies` lists the `main` branch and the `v*` tag, and nothing else.
- [x] 1.6 **[Agent]** Set the custom domain to `tabby-bell-indicator.dariomarcelino.com` with `gh api -X PUT repos/dmarcelino/tabby-bell-indicator/pages -f cname=…`. Verify: `gh api repos/dmarcelino/tabby-bell-indicator/pages --jq .cname` prints the domain, and `gh api repos/dmarcelino/tabby-bell-indicator/pages/health` reports no DNS problem.

## 2. Page build

- [x] 2.1 Add `marked` as a devDependency, a `site` script (`node site/build.mjs`) to `package.json`, and `_site/` to `.gitignore`. Verify:
  - `npm ci` succeeds and `npm ls marked` shows it as a dev dependency;
  - `npm run build` produces a `dist/index.js` byte-identical to the one built before this change (the plugin bundle is unaffected);
  - `npm pack --dry-run` still lists only `package.json`, `README.md`, `LICENSE` and `dist/index.js`.
- [x] 2.2 Add `site/render.mjs` (design D1, D2): render Markdown with `marked`, rewrite relative links to GitHub at a given ref, keep relative images and return them as a list of files to copy, take the title from the first heading, fill the template. Add `site/render.spec.mjs` and include `site/**/*.spec.mjs` in `vitest.config.mts`. Verify: `npm test` passes, with tests for every case listed in design D7 (absolute links and anchors unchanged; relative links at a given ref and at the default `main`, anchors kept; images listed; headings, lists, table, inline code, code blocks inside list items and image rendered; title; no `<script>`).
- [x] 2.3 Add `site/style.css` (dariomarcelino.com's `static/style.css` without the blog-only rules, design D3), `site/template.html` (skip link; header with the avatar linking to `https://dariomarcelino.com` and nav links **Source** and **npm**; README in `<article class="prose">`; footer with year, name and MIT license link; head metadata), and a new `NOTICE` with a line naming the stylesheet's origin. Each file starts with an SPDX header (`MIT`); the stylesheet also names its origin. Verify: the files exist with their headers, and the template has no `<script>`.
- [x] 2.4 Add `site/build.mjs`: read `README.md`, `package.json` and the template; check that every relative link and image target exists (fail with the missing path, writing nothing); write `_site/index.html`, `_site/style.css` and the listed images; take the ref from `SITE_REF`, defaulting to `main`. Use `node:path` for files and `node:path/posix` for URLs. Add a test for the missing-file check with a fake `exists` function. Verify:
  - `npm run site` writes `_site/index.html`, `_site/style.css` and `_site/doc/demo.gif`;
  - `SITE_REF=v9.9.9 npm run site` gives links to `…/blob/v9.9.9/doc/TESTING.md` and `…/blob/v9.9.9/LICENSE` (the footer's license link included);
  - with a temporary link to `doc/missing.md` in the README, `npm run site` exits non-zero and names `doc/missing.md` (then revert the README);
  - `npm run typecheck`, `npm test` and `npm run build` pass with no new warnings.
- [ ] 2.5 Check the built page by opening `_site/index.html` in a browser, side by side with dariomarcelino.com. Verify, with screenshots in the PR description:
  - light and dark mode match the main site's colours, fonts, column width and header;
  - at 360 px wide, only code blocks scroll sideways;
  - the demo image loads, and the Source, npm and avatar links go to the right places.

- [x] 2.6 Set `homepage` in `package.json` to `https://tabby-bell-indicator.dariomarcelino.com` (design D8). Verify: `npm pkg get homepage repository.url bugs.url` prints the new homepage and the unchanged GitHub URLs.

## 3. CI and deployment workflows

- [ ] 3.1 Add a **Build site** step (`npm run site`) after **Build** in `.github/workflows/ci.yml`. Verify: the PR's CI check runs the step and passes on Linux, macOS and Windows.
- [ ] 3.2 Add `.github/workflows/pages.yml` as in design D4: triggers `workflow_dispatch` and `workflow_call`; a `build` job (`contents: read`, `persist-credentials: false`, Node 24 with caching off, `npm ci`, `npm run site` with `SITE_REF: ${{ github.ref_name }}`, upload-pages-artifact from `_site`; no configure-pages, see design D4) and a `deploy` job (`environment: github-pages`, `pages: write`, `id-token: write`, `concurrency: pages` with `cancel-in-progress: false`, deploy-pages). Top-level `permissions: {}`, an SPDX header, and every action pinned to a full commit SHA with its version in a comment. Verify: the workflow file parses (GitHub shows no workflow error on the PR), and every `uses:` line is pinned to a SHA.
- [ ] 3.3 Add a `pages` job to `.github/workflows/release.yml` that `needs: publish` and calls `./.github/workflows/pages.yml` with `contents: read`, `pages: write` and `id-token: write`. Leave `verify`, `publish` and `github-release` unchanged. Verify: `git diff` touches only the new job, and the PR shows no workflow error for `release.yml`.
- [x] 3.4 Update `doc/RELEASING.md`:
  - the page is deployed by the release's `pages` job after `publish`;
  - how to run a deploy by hand (`gh workflow run pages.yml --ref <latest tag>`, or `--ref main` before the first tag that has `pages.yml`);
  - the one-time setup from group 1;
  - rollback (turn off Pages, delete the CNAME).

  Verify: every command in the new section matches what was run in group 1 and works as written.

## 4. First deploy and live checks

- [ ] 4.1 **[Maintainer]** Review and merge the PR. Verify: CI on `main` passes after the merge.
- [ ] 4.2 **[Agent]** Start the first deploy by hand on `main` (`gh workflow run pages.yml --ref main`). Verify: the run succeeds, and `curl -sI https://tabby-bell-indicator.dariomarcelino.com/` returns `200`. If HTTPS isn't ready yet, `http://` returns `200` and HTTPS is checked in 4.3.
- [ ] 4.3 **[Agent]** Once GitHub has issued the certificate, turn on Enforce HTTPS (`gh api -X PUT repos/dmarcelino/tabby-bell-indicator/pages -F https_enforced=true`). Verify: `curl -sI http://tabby-bell-indicator.dariomarcelino.com/` returns a redirect to `https://`, and the `https://` address returns `200`.
- [ ] 4.4 **[Agent]** Set the repo's Website field (`gh repo edit dmarcelino/tabby-bell-indicator --homepage https://tabby-bell-indicator.dariomarcelino.com`). Verify: `gh repo view dmarcelino/tabby-bell-indicator --json homepageUrl` prints the domain.
- [ ] 4.5 **[Agent]** Check the live page against the spec. Verify:
  - all of the README's text is there;
  - `doc/demo.gif` loads from the page's own domain;
  - the repo-file links point to `…/blob/main/…`;
  - the Source, npm and avatar links work;
  - the page has no `<script>`;
  - dark mode and the 360 px width look right.
- [ ] 4.6 **[Maintainer]** Disable or delete the Porkbun API key and `~/.config/porkbun/credentials.env`, unless you keep them for other subdomains. Verify: Porkbun's API Access page shows the key's chosen state.

## Workflow follow-up

- No test in a running Tabby is needed: the plugin bundle doesn't change (task 2.1). Say so in the PR, and leave `doc/TESTING.md` unchanged.
- On the next release (`v0.1.1` or later), confirm that the release's `pages` job deploys the page from the tag, and that the page's repo-file links then point to that tag.
- The new `homepage` (task 2.6) reaches npm with the next release; check it on the npm page then.
- Archive the change once the PR is merged and group 4 is done.
