# Proposal

## Why

The plugin has no web page of its own. People who hear about it land on the GitHub repo or the npm page, both of which are built for developers. A small page at `tabby-bell-indicator.dariomarcelino.com`, styled like dariomarcelino.com, gives the plugin a stable, readable home and ties it to its author. The README already explains everything a user needs, so the first version of the page is the README itself.

## What Changes

- A static page, generated from `README.md` at build time, so the page and the README never drift apart. No hand-written copy of the content.
  - Relative links in the README are fixed: `doc/demo.gif` is served with the page; links to other repo files (`doc/TESTING.md`, `LICENSE`) point to the file on GitHub at the version the page was built from.
  - The build fails if the README links to a repo file that doesn't exist.
- Styling copied from dariomarcelino.com's stylesheet, trimmed to the rules the page uses: same layout, fonts, column width, header with the 3px rule, light and dark mode. No JavaScript.
- The same header layout as dariomarcelino.com: the avatar links back to dariomarcelino.com, and the nav has **Source** (the GitHub repo) and **npm** (the npm package).
- Deployment to GitHub Pages:
  - after each release is published to npm, so the page shows the README of the version people can install;
  - plus a manual run, for the first deploy and for styling fixes between releases.
  It is never deployed from a pull request.
- CI builds the page on every pull request and push to `main`, on Linux, macOS and Windows.
- One-time setup outside the repo: the DNS record at Porkbun, verifying `dariomarcelino.com` in the maintainer's GitHub account, turning on Pages with the custom domain and HTTPS, and allowing release tags to deploy to the `github-pages` environment.
- `package.json` `homepage` points to the page instead of the GitHub README. npm shows it from the next release.
- Docs: `doc/RELEASING.md` covers the page's deploy and its one-time setup. A new `NOTICE` file records where the stylesheet comes from.

Not in scope:
- content beyond the README (other pages, a blog, screenshots beyond `doc/demo.gif`);
- analytics, cookies, comments or any third-party script;
- changes to the plugin's behaviour or to the npm package's contents.

## Capabilities

### New Capabilities
- `project-website`: the plugin's public web page: where its content comes from, what it must show and link to, how it looks, and when and where it is built and deployed.

### Modified Capabilities
<!-- None. plugin-release already forbids source files in the npm package, which keeps site files out; its requirements are unchanged. -->

## Impact

- **Repo files:**
  - new: `site/` (page template, stylesheet, build script and its tests), `.github/workflows/pages.yml`, `NOTICE`;
  - changed: `.github/workflows/ci.yml` (build the page), `.github/workflows/release.yml` (deploy the page after publishing), `package.json` (a `site` script, a `marked` devDependency and the new `homepage`), `vitest.config.mts` (include the site tests), `.gitignore` (the build output), `doc/RELEASING.md`.
- **External systems** (set by the maintainer, or by an agent only after the maintainer confirms each step):
  - Porkbun DNS: a CNAME `tabby-bell-indicator` → `dmarcelino.github.io`, and a TXT record for GitHub's domain verification;
  - GitHub: domain verification on the maintainer's account; Pages for this repo (built by Actions, custom domain, HTTPS enforced); a `v*` tag rule on the `github-pages` environment.
- **npm package:** unchanged. `files` in `package.json` already leaves `site/` out.
- **Dependencies:** `marked` as a devDependency, used only by the page build. It never reaches the plugin bundle.
