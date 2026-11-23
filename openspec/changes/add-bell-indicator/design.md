# Design

## Context

The repo is empty apart from `AGENTS.md`, so the plugin scaffold is part of this change. For the motivation, see proposal.md (Why); the required behaviour is in `specs/tab-bell-indicator/spec.md`.

What Tabby (upstream `tabby-core` / `tabby-terminal`) already provides:

- **Bell events.** `XTermFrontend` forwards xterm's `onBell` to `Frontend.bell$`. Tabby's own handler (`baseTerminalTab.component.ts`, the `frontend.bell$` subscription) plays the sound, shows the visual bell, flashes the frame and calls `displayActivity()` when the tab is unfocused. xterm's parser does not report a BEL that ends an OSC sequence as a bell.
- **Terminal hook.** `TerminalDecorator.attach(terminal)` is called for every terminal, after `terminal.frontend` exists. `detach()` is called before the terminal is destroyed.
- **Focus.**
  - `AppService.selectTab` emits `focused$` on the newly active tab.
  - `SplitTabComponent` forwards `focused$` to **all** its panes, then blurs every pane except the focused one.
  - `AppService` re-emits `focused$` on the active tab when the window regains focus (`hostWindow.windowFocused$`).
  - There is no public "window blurred" event or `isFocused` flag.
- **Split panes.**
  - Panes are flattened by `SplitTabComponent.getAllTabs()`. Nested splits are `SplitContainer`s inside one `SplitTabComponent`, not separate tabs.
  - `AppService.getParentTab(pane)` returns the top-level split tab that contains a pane.
  - Splits emit `tabAdded$` / `tabRemoved$`.
  - Tabby passes activity up with "last event wins" (`a ? displayActivity() : clearActivity()`). That rule is not reused here.
- **Tab header.** `tab-header` (`tabHeader.component.pug`) is rendered by `*ngFor` over `app.tabs` inside `.tabs` (`appRoot.component.pug`). It contains `.pin-indicator` (an `*ngIf`) and `.name`. It has no extension point: its `ng-content` is never filled, and there is no provider for it. During a CDK drag, the dragged `tab-header` is moved out of `.tabs` into a preview container, and `AppService.tabDragActive$` reports the drag.

## Goals / Non-Goals

**Goals:**
- Keep the bell state and clearing rules separate from Tabby, so they can be unit-tested with fakes and a fake clock.
- Limit the use of Tabby internals to one small, replaceable DOM adapter in `src/tabbyAdapter.ts`.

**Non-Goals:**
- Changing Tabby's activity line or its "last event wins" propagation.
- Showing which pane inside a split rang.
- Persisting bell state across restarts or tab recovery.
- Bells from non-terminal tabs. They have no `bell$`, so they are ignored.
- An upstream Tabby extension point for tab headers. That would be a separate contribution.

## Decisions

### D1. Listen to `frontend.bell$` from a `TerminalDecorator`
`BellDecorator extends TerminalDecorator` subscribes to `terminal.frontend.bell$` in `attach()` with `subscribeUntilDetached`, and calls `BellStateService.ring(terminal)`. In `detach()` it calls `BellStateService.forget(terminal)`.
- *Alternative:* scan `output$`/`binaryOutput$` for `0x07`. Rejected: it would count BEL used as an OSC terminator as a bell, and would duplicate xterm's parser.

### D2. One state service; per-pane state; tab state computed on read
`BellStateService` keeps `Map<BaseTabComponent, PaneBell>` for panes with an unseen bell. It is a plain class: the module provides it through a factory, and passes it a `TabTree` built from `AppService` and `SplitTabComponent` (`src/tabTree.ts`). Tabby's packages can't be loaded outside Tabby (they need Electron and the JIT compiler), so the state, tree and renderer code imports only types from `tabby-*`, and unit tests pass in fakes. `PaneBell` holds a pending timer, if any. The service exposes:
- `ring(pane)` / `clear(pane)` / `forget(pane)`
- `isRinging(topLevelTab): boolean`: for a `SplitTabComponent`, true if any `getAllTabs()` pane is ringing; otherwise, true if the tab itself is ringing.
- `changed$: Observable<void>`, emitted whenever the set of ringing panes changes.

The tab state is computed from the current pane tree every time the adapter renders, and is never stored. Moving panes between tabs, nesting splits and closing panes therefore cannot leave a stale flag on a parent. That gives the "any pane" (OR) rule in the spec.
- *Alternative:* mirror Tabby's activity propagation, where the parent subscribes to each child's events. Rejected: "last event wins" breaks the OR rule, and keeping subscriptions in step with pane moves is error-prone.

### D3. Clearing rules live in the service; time and window focus are injected
Two predicates:
- **Tab seen:** the pane's top-level tab (`app.getParentTab(pane) ?? pane`) is `app.activeTab`, and the window is focused.
- **On screen:** the tab is seen, and the split has no maximized pane, or the maximized pane is this pane (`SplitTabComponent.getMaximizedTab()`, exposed as `TabTree.maximizedPaneOf`).

On `ring(pane)`:
1. Mark the pane as ringing and cancel any pending timer.
2. If the pane is on screen, start a 2000 ms timer. On expiry, clear the pane if it is still on screen. Otherwise it stays ringing.
3. Otherwise, start no timer.

Clearing on focus:
- On the first `ring` of a pane, the service subscribes to `pane.focused$` until `pane.destroyed$`. On each emission it clears the pane **only if the tab is seen**.
- Because split tabs forward `focused$` to every pane, and `AppService` re-emits `focused$` on window focus, this one subscription covers "opening the tab clears every pane" (including panes hidden behind a maximized one) and "returning to the window".
  - `selectTab` sets the active tab before it emits `focused$` (in `setImmediate`).
  - The window is focused by the time `windowFocused$` fires.
- The "tab seen" check is needed. Tabby also emits `focused$` for panes the user isn't looking at:
  - `SplitTabComponent.removeTab()` → `focusAnyIn()` → `focus(pane)` when a sibling pane closes, even in a background tab;
  - `onAfterTabAdded()`;
  - `focusFollowsMouse` on mouse movement over an unfocused window.

  (Corrected after review: an earlier version of this design assumed these could not happen.)
- The maximized check applies only to the timer, not to focus clearing. Opening a tab clears every pane, as decided. A bell in a hidden pane of the tab you are looking at stays until you open that tab again, refocus the window or focus the pane, so it isn't lost after 2 s unseen.

`setTimeout`/`clearTimeout` are used directly and tested with vitest fake timers. Window focus is read through a small `WindowFocus` abstraction whose default implementation is `document.hasFocus()`, which works on every OS, and which tests replace with a fake.
- *Alternative:* a flag driven by `windowFocused$` plus a DOM `blur` listener. Rejected: Tabby has no public blur event, and `document.hasFocus()` answers the question at the moment it matters.
- *Alternative:* cancel the timer when the user switches away. Rejected: the spec keeps the bell until the tab is seen again, and checking on expiry covers that.

### D4. Rendering by syncing with the DOM, in `tabbyAdapter.ts` only
`TabHeaderBellRenderer` (in `src/tabbyAdapter.ts`) runs `sync()`:
1. Find the tab list, `.tab-bar > .tabs`, inside the window content, `app-root .content.main`.
   - If the tab list is missing, the tab bar is hidden (fullscreen with `tabsInFullscreen` off). Do nothing, without warning.
   - Warn once only if `.content.main` itself is missing.
2. If the tab list holds a `.cdk-drag-placeholder`, a drag is in progress: skip the sync entirely. This check doesn't rely on `tabDragActive$`, because tabby-core reports the end of a drag whenever a tab opens or closes, even mid-drag.
3. Take the `tab-header` children in document order. Header *i* belongs to `app.tabs[i]`, because Angular's `*ngFor` keeps the DOM order in line with the array. If the count differs from `app.tabs.length`, skip this sync: Angular is mid-update, and a later trigger re-syncs.
4. For each header:
   - If `bellState.isRinging(tab)`, make sure there is one `<div class="bell-indicator"><i class="far fa-bell"></i></div>`, directly before `.name`. In the current tab-header template `.pin-indicator` sits directly before `.name`, so a pinned tab shows pin, bell, title.
   - If the tab is not ringing, remove any indicator.
   - Move an indicator that is out of place, for example after the pin was added.

Triggers:
- `bellState.changed$`, `app.tabsChanged$`, `app.activeTabChange$`, and the end of a drag (`tabDragActive$` emits `null`).
- A `MutationObserver` on the tab list, with `childList: true, subtree: true`. It covers Angular re-rendering a header or toggling `.pin-indicator`, and the drag placeholder going away.
- A second `MutationObserver` on `.content.main` (`childList` only). It sees `.tab-bar` removed and rebuilt around fullscreen, which fires none of the other triggers.
- Each sync moves both observers to the current elements, and then drops the records caused by the renderer's own changes (`takeRecords()`).

All triggers are batched to one `sync()` per animation frame (`requestAnimationFrame`). Syncing is also paused while `tabDragActive$` reports a drag.

The frames and observers run outside Angular's zone (`NgZone.runOutsideAngular`), because the sync touches only DOM nodes the plugin owns. Otherwise every tab-bar mutation would trigger app-wide change detection. The frame request itself goes through `runOutsideAngular`: rxjs triggers arrive in the zone of whoever emits them, and zone.js binds a `MutationObserver` callback to the zone it is created in.

The indicator copies `.pin-indicator`'s layout (flex, 12px, opacity 0.8, right margin) through a small stylesheet injected by the plugin, so it fits both horizontal and vertical tab bars.
- *Alternative:* wrap the factory of `TabHeaderComponent` (`ɵfac`) to capture its `ElementRef`. Rejected: it depends on private Angular internals, and on running before the first render.
- *Alternative:* map headers to tabs by their tooltip or title text. Rejected: not unique.

### D5. Plugin module and scaffold
- `src/index.ts` defines `BellNotificationModule` (`NgModule`). It provides `{ provide: TerminalDecorator, useClass: BellDecorator, multi: true }` and starts the renderer once `AppService.ready$` fires. It logs one startup line through `LogService`, so `log.txt` shows the plugin loaded.
- There is no `ConfigProvider`, because the plugin has no settings.
- The scaffold follows `AGENTS.md`:
  - Package name `tabby-bell-notification`, the `tabby-plugin` keyword and the `author` field.
  - Angular 15 and RxJS 7, plus `tabby-core` / `tabby-terminal`, as peer and dev dependencies only, and listed as `externals` in webpack.
  - vitest, with `jsdom` as the environment for the adapter tests.
  - An SPDX header on every source file. The license defaults to MIT, the same as upstream Tabby. Changing it only affects `package.json`, `LICENSE` and the headers.

## Risks / Trade-offs

- [The header DOM is internal and can change in any Tabby release] → All DOM knowledge lives in `tabbyAdapter.ts`. If `.content.main` or a header's `.name` is not found, the renderer logs one warning and does nothing; it never throws. Adapter tests use a fixture copied from the current template, so a template change has one place to update.
- [Index mapping goes wrong during transient states, such as a drag or Angular mid-update] → Skip a sync when counts differ, and while a drag placeholder is in the tab list. Pause while `tabDragActive$` reports a drag. Re-sync after the drag ends and on every DOM mutation.
- [The tab bar is rebuilt (leaving fullscreen) with no Tabby event] → The observer on `.content.main` sees it and triggers a sync.
- [The npm `tabby-core` typings (1.0.231-nightly.0) are older than the Tabby the plugin was tested on (1.0.238); for example, their tab-header template has no pin icon] → Behaviour is verified in a running Tabby (`doc/TESTING.md`). Update the dev dependency once a newer release is published.
- [Angular removes the inserted node when it re-creates a header] → The `MutationObserver` triggers a re-sync, which re-inserts it.
- [A `MutationObserver` with `subtree` fires often (title changes, progress bar)] → Syncs are batched per animation frame, and `sync()` touches the DOM only when the state differs.
- [`document.hasFocus()` can be briefly wrong while focus is moving between windows] → Worst case, a bell clears on the next tab focus instead of after 2s, or vice versa. This is acceptable and stays within the spec's "wait for focus" behaviour.
- [`focused$` fires for every pane when a split tab is selected] → This is the intended "opening the tab clears every pane" behaviour, not a risk, but it is documented here because it depends on upstream behaviour.

## Migration Plan

Not applicable: this is a new plugin with no stored state. Rollback is disabling or uninstalling the plugin.
