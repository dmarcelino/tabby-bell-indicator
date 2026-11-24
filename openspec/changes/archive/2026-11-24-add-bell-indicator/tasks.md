# Tasks

## 1. Plugin scaffold

- [x] 1.1 Create `package.json` following design D5:
  - name `tabby-bell-notification`, `tabby-plugin` keyword, `author`, `license` (MIT), `main: dist/index.js`;
  - scripts `build`, `watch`, `test`, `typecheck`;
  - Angular 15, RxJS 7, `tabby-core` and `tabby-terminal` as peer and dev dependencies only.

  Verify: `npm install` succeeds and commit the resulting lockfile so that `npm ci` succeeds.
- [x] 1.2 Add `tsconfig.json`, `webpack.config.mjs` (`externals` for `@angular/*`, `@ng-bootstrap/*`, `rxjs`, `tabby-*` and Node built-ins) and a vitest config (`src/**/*.spec.ts`). Verify: `npm run typecheck` and `npm run build` pass on a stub `src/index.ts`.
- [x] 1.3 Add `LICENSE` (MIT), a `.gitignore` covering `node_modules/`, `dist/` and `.env.local`, and SPDX headers on every source file. Verify: `grep -L SPDX-License-Identifier` over `src/**/*.ts` and the config files lists nothing.
- [x] 1.4 Create `BellNotificationModule` in `src/index.ts`. It logs one startup line through `LogService`. Link the repo into Tabby's plugins folder, as `AGENTS.md` describes. Verify: after restarting Tabby, `log.txt` contains the startup line.

## 2. DOM spike in a running Tabby

- [x] 2.1 In `src/tabbyAdapter.ts`, add a throwaway version of the header renderer that marks every *n*-th tab with `far fa-bell`, using the index mapping and the placement after `.pin-indicator` / before `.name` (design D4). Verify in a running Tabby that:
  - the icon renders, aligned with the pin icon, on tab bars at the top and on the left;
  - it stays on the right tab after opening, closing, pinning or unpinning a tab, and after reordering by dragging;
  - Font Awesome's regular (`far`) style renders.

  Record the results in `doc/TESTING.md`.
- [x] 2.2 If 2.1 shows that the index mapping or the drag pause does not hold, stop. Update `design.md` (D4 and Risks) with the alternative before continuing. Verify: `design.md` reflects what the spike found, or 2.1's notes say that D4 held.

## 3. Bell state and clearing rules

- [x] 3.1 Implement the `WindowFocus` abstraction, with a `document.hasFocus()` default, and `BellStateService` with `ring` / `clear` / `forget` / `isRinging` / `changed$` (design D2). `isRinging` for a split tab checks every pane from `getAllTabs()`. Verify: unit tests with fake tabs and a fake split cover the scenarios in the "Split panes pass the bell up to their tab" requirement: nested pane, one of two panes cleared, pane moved between tabs.
- [x] 3.2 Implement the clearing rules (design D3):
  - clear on `pane.focused$`;
  - a 2000 ms timer when the pane is visible and the window is focused, restarted by every new bell;
  - on expiry, clear only if the pane is still visible and the window still focused;
  - drop the pane on `destroyed$` / `forget`.

  Verify: unit tests with vitest fake timers, a fake `AppService` and a fake `WindowFocus` cover every scenario in these requirements: "Focusing a tab clears its bells", "Bells in a visible tab clear after 2 seconds" and "Bells while the window is unfocused wait for focus".

## 4. Bell detection

- [x] 4.1 Implement `BellDecorator extends TerminalDecorator`: in `attach()`, subscribe to `terminal.frontend.bell$` and call `ring`; in `detach()`, call `forget` and then `super.detach()`. Register it as `TerminalDecorator` with `multi: true` in `BellNotificationModule` (design D1). Verify: unit tests with a fake terminal whose `frontend.bell$` is a `Subject` show that a bell calls `ring` and that detach stops listening and calls `forget`.

## 5. Header renderer

- [x] 5.1 Replace the spike renderer in `src/tabbyAdapter.ts` with `TabHeaderBellRenderer` (design D4):
  - index mapping that skips the sync when the counts differ;
  - insert, remove or move the `.bell-indicator`;
  - injected stylesheet that copies `.pin-indicator`'s layout;
  - one warning and no throw when the expected elements are missing.

  Verify: jsdom unit tests on a fixture copied from the current `tab-header` template cover pinned and unpinned placement, only the ringing tab marked, reorder, removal after clearing, a count mismatch skipping the sync, and the missing-elements warning.
- [x] 5.2 Wire the triggers: `changed$`, `tabsChanged$`, `activeTabChange$`, the end of a drag, and a `MutationObserver` on `.tabs`. Batch them to one sync per animation frame, pause during a drag, and start everything on `AppService.ready$` from `BellNotificationModule`. Verify: unit tests with fake observables show triggers are batched, syncs are paused during a drag and resume after it, and the renderer's own DOM changes don't re-trigger a sync.

## 6. Documentation and integration check

- [x] 6.1 Write `README.md`: what the plugin does, how bells are cleared, install and link steps for Windows, macOS and Linux, and the known limitation that a Tabby update can break the header icon. Verify: the README's link steps match `AGENTS.md`, and every macOS command in it has been run. (Narrowed after review: only macOS is available here. The Linux and Windows link commands follow `AGENTS.md` but were not run; `doc/TESTING.md` records this gap.)
- [x] 6.2 Run `npm run typecheck`, `npm test` and `npm run build`. Verify: all three pass and the build shows no new warnings.
- [x] 6.3 Test manually in a running Tabby and record the results in `doc/TESTING.md`. Use `printf '\a'` (`[char]7` in PowerShell) after a delay. Cover these cases:
  - a background tab;
  - a visible tab (clears after 2 s, and repeated bells restart the 2 s);
  - an unfocused window;
  - a non-focused pane of the active split;
  - a nested split in a background tab;
  - a pinned tab;
  - a left tab bar;
  - Tabby's bell set to "off";
  - an OSC title sequence that must not trigger the icon.

  Note which OSes were tested and which were not.

## 7. Review fixes

- [x] 7.1 Clear a pane on `focused$` only when its tab is active and the window has focus, so focus events Tabby sends by itself (for example after another pane in a background split closes) don't clear an unseen bell. Verify: unit tests for focus on a background pane and focus while the window is unfocused.
- [x] 7.2 Don't start or complete the 2 s auto-clear for a pane hidden behind another maximized pane of the active split. Opening the tab or refocusing the window still clears it (refocusing changed in 8.1: it no longer clears a hidden pane). Verify: unit tests for a hidden pane, the maximized pane itself, and a pane hidden before its timer expires.
- [x] 7.3 Re-sync the header icons when Tabby rebuilds the tab bar (leaving fullscreen), and don't warn while the tab bar is hidden. Verify: jsdom test of a fullscreen round-trip with a real `MutationObserver`.
- [x] 7.4 Skip a header sync while a CDK drag placeholder is in the tab bar, even if `tabDragActive$` already reported the end of the drag. Verify: jsdom test with a placeholder present, then removed.
- [x] 7.5 Run the header sync loop outside Angular's zone. Verify: `npm run build` passes, and the plugin still shows and clears icons in a running Tabby (7.7).
- [x] 7.6 README: create `plugins/node_modules` before linking. `package.json`: remove `typings`, which pointed at a file the build doesn't emit. Verify: the macOS commands run, and `npm run build` doesn't emit `dist/index.d.ts`.
- [x] 7.7 Run `npm run typecheck`, `npm test` and `npm run build`. Re-run the affected manual cases in a running Tabby: background split pane closing, maximized pane, fullscreen round-trip, plus a smoke test of cases 1 and 2. Verify: all checks pass, and `doc/TESTING.md` has the results.

## 8. Clear 2 s after returning to the window

- [x] 8.1 Add `activeTabChange$` to `TabTree` (from `AppService.activeTabChange$`) and the **must open** flag to `BellStateService` (design D3). On `focused$` while the tab is seen: clear at once if the flag is set; otherwise start the 2 s timer if the pane is on screen and has no pending timer. Verify: unit tests cover returning to the window (still shown just after, removed 2 s later), the window losing focus during the 2 s then returning, switching away within 2 s of returning, a hidden pane on returning, switching away and back (cleared at once), and opening a background tab (cleared at once).
- [x] 8.2 Update the README's table of when the icon clears, and the comments in `src/bellState.ts`. Verify: the README table matches the spec.
- [x] 8.3 Review fixes:
  - a tab that Tabby makes active while the window is unfocused starts the 2 s on return instead of clearing at once;
  - focusing a hidden pane starts the 2 s even though Tabby un-maximizes the split only after the focus event;
  - losing window focus (DOM `blur`) stops pending timers, so returning always gives the full 2 s;
  - opening a tab also clears a ringing pane moved into it from the active tab;
  - README: a hidden pane also clears 2 s after it is shown and focused.

  Verify: one unit test per fix, each failing with the old logic.
- [x] 8.4 Run `npm run typecheck`, `npm test` and `npm run build`. Re-test in a running Tabby: returning to the window, the window losing focus during the 2 s, a hidden maximized pane on returning, plus a smoke test of cases 1 and 2. Verify: all checks pass, and `doc/TESTING.md` has the results.
