# Design

## Context

- **dariomarcelino.com** comes from the public repo `dmarcelino/dariomarcelino.com`:
  - GitHub Pages, deployed by an Actions workflow (`build_type: workflow`), custom domain set, HTTPS enforced.
  - A small Node build (`marked`, `gray-matter`) renders Markdown into one HTML layout.
  - `static/style.css` (about 4.5 KB, no framework, no JavaScript) styles headings, lists, tables, `pre`/`code`, images, a header with a round avatar and nav links, a footer, and a dark mode through `prefers-color-scheme`. It also has blog-only rules (post lists, post meta).
  - Its `github-pages` environment only allows deploys from `main`, which is GitHub's default.
- **DNS** for `dariomarcelino.com` is at Porkbun. `www` is a CNAME to `dmarcelino.github.io`. `tabby-bell-indicator.dariomarcelino.com` has no record, and there's no wildcard. There is no `_github-pages-challenge-dmarcelino` TXT record, so the domain isn't verified in the maintainer's GitHub account.
- **This repo:**
  - Pages isn't turned on, and there's no `github-pages` environment yet. The `npm` environment and a `v*` tag ruleset exist (see the archived `add-npm-release-pipeline` change).
  - `release.yml` has three jobs: `verify` → `publish` → `github-release`.
  - `ci.yml` runs typecheck, test and build on Linux, macOS and Windows.
  - npm `files` is `[dist, LICENSE, README.md]`.
  - The only tag is `v0.1.0`. `README.md` and `doc/demo.gif` haven't changed since then (checked with `git diff v0.1.0 HEAD`).
- **The README** uses headings, lists, one table, inline code, code blocks nested in list items, one image (`doc/demo.gif`, 407 KB) and relative links to `doc/TESTING.md` and `LICENSE` (`src/tabbyAdapter.ts` is only named in inline code, not linked). It uses no GitHub-only Markdown (alerts, emoji shortcodes, Mermaid).

## Goals / Non-Goals

**Goals:**
- One source for the content: the page can't drift from the README.
- The page is built from the same git ref as the npm release it describes.
- Nothing new runs in a job that can publish to npm.
- The build works on Windows, macOS and Linux, like the rest of the repo.

**Non-Goals:**
- A general static-site generator, more pages, a sitemap or RSS.
- Keeping the stylesheet in sync with dariomarcelino.com automatically. The copy is a snapshot.
- Rendering GitHub-only Markdown the README doesn't use.

## Decisions

### D1. Render the README with `marked` in a small Node script
- `site/build.mjs` reads `README.md`, renders it with `marked` (GitHub-flavoured Markdown on), puts the HTML into `site/template.html`, and writes `_site/index.html`, `_site/style.css` and the README's images to `_site/`.
- The logic that doesn't touch the file system (rendering, link rewriting, filling the template) lives in `site/render.mjs`, so it can be unit-tested with fakes. `build.mjs` only reads, checks and writes files.
- `npm run site` runs it. `_site/` is git-ignored.
- `marked` is a devDependency. It is only used by the page build and never reaches `dist/index.js`.
- The page's `<h1>` is the README's own `# tabby-bell-indicator`. `<title>` is that heading's text, and the meta description is `package.json`'s `description`.
- Asset paths in the page are relative (`style.css`, `doc/demo.gif`), so `_site/index.html` also works when opened straight from disk.

*Alternatives:*
- **Hand-written HTML copy:** no build step, but it drifts from the README. The user chose generating.
- **Jekyll (GitHub Pages' built-in README rendering):** no script of our own, but matching dariomarcelino.com would need a custom Jekyll layout and a Ruby toolchain for local previews, and its link handling is less predictable.
- **Reusing dariomarcelino.com's build code:** it is built around posts, frontmatter, RSS and a sitemap. Most of it would be dead code here.

### D2. Rewriting relative links
`render.mjs` uses `marked`'s token walk to visit every link and image before rendering:
- **Absolute URLs** (`http:`, `https:`, `mailto:`) and **in-page anchors** (`#…`) are left alone.
- **Relative images** keep their relative path and are added to the list of files to copy into `_site/` at the same path. They are served from the page's own domain.
- **Other relative links** become `https://github.com/dmarcelino/tabby-bell-indicator/blob/<ref>/<path>`, keeping any `#anchor`.
- **The ref** comes from the `SITE_REF` environment variable, set to `${{ github.ref_name }}` by the deploy workflow (a tag like `v0.2.0`, or `main` for a manual run on `main`). Without it, the ref is `main`.
- **Missing files:** `build.mjs` checks that every relative target exists in the repo. If one doesn't, the build fails with an error naming it and writes nothing. Paths are URL-decoded and stripped of `?query` and `#anchor` before the check.
- **Paths:** URL paths always use `/` (`node:path/posix`); file-system paths use `node:path`, so the build works on Windows.
- Raw HTML in the README is passed through. The README is our own trusted file, so no sanitizing step.

### D3. Template and stylesheet
- **`site/style.css`** is a copy of dariomarcelino.com's `static/style.css`, minus the blog-only rules (post lists, post meta, `.latest`, `.more`, `.empty`). Colours, fonts, the 46rem column, the header's 3px rule, the footer and the dark-mode colours stay as they are. It starts with an SPDX line and a comment naming where it came from. `NOTICE` gets a matching line.
- **`site/template.html`** follows dariomarcelino.com's layout:
  - a skip link;
  - a header with the avatar, linking to `https://dariomarcelino.com`, and nav links **Source** and **npm**;
  - `<main>` with the README in an `<article class="prose">`;
  - a footer with `© <year> Dário Marcelino · MIT`, linking to the LICENSE on GitHub.
- **Head:** charset, viewport, title, description, canonical URL, and basic Open Graph tags (`og:title`, `og:description`, `og:url`, `og:type`).
- **Avatar and favicon** load from `https://dariomarcelino.com/avatar.jpg` and `/favicon.svg`, rather than being copied into this repo. This keeps a personal photo and a 72 KB icon out of the plugin repo, and they stay in step with the main site.
- **No `<script>`** anywhere. The build's tests check this.

*Alternatives:*
- **Loading `https://dariomarcelino.com/style.css` directly:** always in sync, but a change to the main site could break this page without anyone noticing. The user chose the copy.
- **Copying the avatar and favicon:** works even if the main site moves them, at the cost of keeping copies here.

### D4. Deploying: a reusable `pages.yml`, called after `publish`
- **`.github/workflows/pages.yml`** is triggered by `workflow_dispatch` (the manual-run button) and `workflow_call`. It has two jobs:
  1. **`build`** (`contents: read`):
     - checks out the ref with `persist-credentials: false`;
     - sets up Node 24 with caching off, like `release.yml`;
     - runs `npm ci` and `npm run site` with `SITE_REF: ${{ github.ref_name }}`;
     - uploads `_site/` with `actions/upload-pages-artifact`.

     No `actions/configure-pages`: its outputs (base URL, path) are for site generators, which this build doesn't use, and it would need read access to the Pages settings in this job.
  2. **`deploy`** (needs `build`; `environment: github-pages`; `pages: write`, `id-token: write`):
     - runs `actions/deploy-pages`;
     - `concurrency: pages` with `cancel-in-progress: false`, so a newer deploy waits instead of cutting one off halfway.
- **`release.yml`** gets a fourth job, `pages`, that `needs: publish` and calls `pages.yml` with exactly those permissions. It runs next to `github-release`.
- Every action is pinned to a full commit SHA with its version in a comment, as in the existing workflows. Dependabot already updates them.

*Why:* the page only changes once the version it describes is on npm. `npm ci` and the page build run in their own jobs, never in the job that holds the npm credential.

*Alternatives:*
- **A separate workflow triggered by the tag push:** simpler, but it would deploy even when the release fails its checks, and the page would describe a version that can't be installed.
- **`workflow_run` after the Release workflow:** runs in the context of the default branch, so the ref has to be dug out of the event, and a failed release has to be filtered out by hand.

### D5. `github-pages` environment rules
- Turning on Pages with `build_type: workflow` creates the `github-pages` environment, which allows `main`.
- We add a deployment rule for tags matching `v*`, so the `pages` job of a release can deploy.
- Any other branch can't deploy, so a manual run started on a feature branch is refused.
- `v0.1.0` predates `pages.yml`, so the manual run can't be started on that tag. The first deploy runs on `main`. That gives the same content as `v0.1.0`, because the README and the demo image haven't changed since.

### D6. Domain, DNS and HTTPS
Order matters. GitHub recommends verifying the domain before using it.
1. **Verify `dariomarcelino.com`** on the maintainer's GitHub account (Settings → Pages → Add a domain). This can only be started in GitHub's web UI. It gives a TXT record name and value; the value isn't secret.
2. **Add the DNS records at Porkbun through its v3 API:**
   - the TXT record from step 1, whose value the maintainer pastes into the conversation;
   - CNAME `tabby-bell-indicator` → `dmarcelino.github.io`, TTL 600.

   The API keys are read from `~/.config/porkbun/credentials.env`, outside the repo. Commands load that file into the shell, never print it, and never put the keys on a command line. Before creating anything, the agent checks that the key works (`/ping`) and that no record with that name exists, and shows the exact record for the maintainer to confirm. API Access must be switched on for the domain in Porkbun.
3. **Click Verify** in GitHub.
4. **Turn on Pages** for the repo with `build_type: workflow`, then **set the custom domain** with `gh api`. No `CNAME` file is added to the site: deploys from a custom workflow ignore it.
5. After the first deploy and once GitHub has issued the certificate, **turn on Enforce HTTPS**.

*Alternative:* adding the records by hand in Porkbun's web UI. That works too and needs no API key. The maintainer chose the API.

### D7. Tests and CI
- Unit tests in `site/render.spec.mjs` (vitest), with `vitest.config.mts` also including `site/**/*.spec.mjs`. They cover:
  - absolute links and anchors left alone;
  - relative links rewritten to GitHub at the given ref, including the default `main` ref and kept anchors;
  - relative images kept and listed for copying;
  - every README structure from the spec rendered;
  - the title taken from the first heading;
  - no `<script>` in the output.
- The missing-file check is tested with a fake `exists` function, not the real file system.
- `ci.yml` gets a **Build site** step after **Build**, so the page builds on all three operating systems. `npm test` already runs the new tests.
- `typecheck` is unchanged: `tsconfig.json` only covers `src/`, and the site code is plain `.mjs`.

### D8. `package.json` `homepage` points to the page
`homepage` becomes `https://tabby-bell-indicator.dariomarcelino.com`. npm shows it from the next release. `repository` and `bugs` still point to GitHub, so the npm page keeps its links to the source and the issue tracker, as `plugin-release` requires. The user chose this.

*Alternative:* keep the GitHub README as the homepage. The page would then only be linked from the repo's Website field.

## Risks / Trade-offs

- **[The main site moves or renames `avatar.jpg` or `favicon.svg`]** → the header shows the image's alt text instead. Fix the URL in the template. A visible change, not a broken page.
- **[The copied stylesheet falls behind the main site's]** → accepted. The copy is a snapshot; re-copy it when the main site changes noticeably.
- **[A future README uses GitHub-only Markdown (alerts, emoji shortcodes)]** → it shows as plain text on the page. Check the page when reviewing README changes. The CI build doesn't catch this.
- **[The release publishes but the `pages` job fails]** → npm and the page disagree until it's fixed. Re-run only the failed job in GitHub. That never re-runs `publish`.
- **[Pages is turned off later but the CNAME stays]** → a dangling subdomain. Verifying the domain stops other GitHub accounts from claiming it. Remove the DNS record whenever Pages is turned off.
- **[The Porkbun key can manage the whole account]** → it's used only from a file outside the repo and never printed. Disable or delete it in Porkbun when the setup is done, unless the maintainer keeps it for later subdomains.
- **[Running a manual deploy on `main` while it has unreleased README changes]** → the page then describes features that aren't on npm. The deploy is manual and deliberate; `doc/RELEASING.md` says to run it on the latest tag when there is one.

## Migration Plan

1. Merge the code (the site build, the workflows, the docs).
2. Do the one-time setup from D5 and D6. The DNS and domain steps can happen before the merge; Pages has to be turned on before the first deploy.
3. Start the manual deploy on `main` for the first page.
4. Turn on Enforce HTTPS once the certificate is issued.
5. Every later release deploys the page by itself.

**Rollback:** turn off Pages for the repo and delete the CNAME record. Releasing to npm doesn't depend on the page: if the `pages` job is removed from `release.yml`, releases work exactly as before.

