# AGENTS.md

This repo is a Tabby plugin: an Angular module that Tabby loads at runtime. What it does and how to set it up are in `README.md`.
Upstream: https://github.com/Eugeny/tabby. Its docs are thin, so read its source (tabby-core, tabby-terminal, tabby-ssh, …) or the typings in `node_modules/tabby-*` for APIs.

## Commands
- Install: `npm ci`
- Build: `npm run build` (webpack → `dist/index.js`)
- Watch: `npm run watch`
- Test: `npm test` (vitest, `src/**/*.spec.ts`)
- Typecheck: `npm run typecheck`
- Run in Tabby: link the repo into Tabby's user plugins folder as `plugins/node_modules/<package name>`. Restart Tabby after each build.
  - macOS: `~/Library/Application Support/tabby/plugins/node_modules/` (`ln -s "$PWD" …`)
  - Linux: `~/.config/tabby/plugins/node_modules/` (`ln -s "$PWD" …`)
  - Windows: `%APPDATA%\tabby\plugins\node_modules\` (`New-Item -ItemType Junction`)
- Check that it loaded: the plugin logs a line on startup, and `log.txt` in Tabby's data folder (the parent of `plugins/` above) contains it.
- Don't use `TABBY_PLUGINS`. Tabby splits it on `:`, which breaks Windows drive paths, and pointing it at a shared parent folder loads every `tabby-*` checkout in it.

## Rules
- Everything listed in `externals` in `webpack.config.mjs` (`@angular/*`, `@ng-bootstrap/*`, `rxjs`, `tabby-*`, Node built-ins) comes from the host at runtime. Never bundle it. Keep these packages in peerDependencies/devDependencies only.
- Not every built-in Tabby plugin is shared with third-party plugins. tabby-core and tabby-terminal are; tabby-ssh is not, so a plain `require('tabby-ssh')` gets a second, unconnected copy or fails. Load such modules only through `src/tabbyAdapter.ts`.
- Use Tabby's public providers (`ConfigProvider`, `ProfileProvider`, `TabContextMenuItemProvider`, `HotkeyProvider`, …), registered with `multi: true` in the plugin's `NgModule` in `src/index.ts`. Any use of Tabby internals (hidden APIs, deep imports, private fields) goes in `src/tabbyAdapter.ts` and nowhere else.
- Angular (15) and RxJS (7) versions must match the Tabby release we target. Check upstream before upgrading any of them.
- Config options get their defaults in the plugin's `ConfigProvider` (`defaults` / `platformDefaults`); profile options in its `ProfileProvider`'s `configDefaults`. Don't scatter fallbacks through the code.
- Keep the `tabby-` package name prefix, the `tabby-plugin` keyword and the `author` field in `package.json`. Tabby silently skips a plugin without `author`.
- Every source file starts with an SPDX header matching the `license` in `package.json` (e.g. `// SPDX-License-Identifier: GPL-3.0-only`). A file ported from another project keeps a header naming its origin and gets a line in `NOTICE`.
- The plugin must work on every OS Tabby runs on (Windows, macOS, Linux). Don't assume a POSIX shell, path separator or locally installed tool.
- If the repo uses OpenSpec, planned work goes through `openspec/changes/`. Tick off tasks in that change's `tasks.md` as you finish them.
- Public repo: no secrets, tokens, hostnames, internal URLs or personal paths in code, fixtures, docs or commit messages. Machine-specific settings go in `.env.local`, which git ignores.
- Don't bump the version or publish to npm unless asked.

## Done means
`npm run typecheck`, `npm test` and `npm run build` pass, and the build shows no new warnings. New behaviour comes with unit tests; use fakes for Tabby services and external processes rather than a running Tabby.
State whether you tested the change in a running Tabby. If you did, record the results in `doc/TESTING.md`. If you couldn't, say so.
