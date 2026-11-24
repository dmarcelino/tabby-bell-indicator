# Proposal

## Why

When a terminal rings the bell (BEL, `\x07`) in a tab you are not looking at, Tabby only shows the generic activity line. That line also appears for ordinary output, so it can't be told apart from a real request for attention, like a finished build or a prompt waiting for input. It is also lost when the bell rings in a split pane that doesn't have focus. A dedicated bell icon in the tab header shows which tabs actually asked for attention.

## What Changes

- New Tabby plugin (`tabby-bell-notification`), built from scratch in this repo: package, build, test and typecheck setup that follows `AGENTS.md`.
- Shows a bell icon (Font Awesome `far fa-bell`) in a terminal tab's header, right after the pin icon, when the terminal rings the bell.
- A bell in a split pane shows on the top-level tab that contains it. The tab shows the icon while any pane inside it, at any nesting depth, has an unseen bell.
- Clears the icon when the bell is seen:
  - Opening the tab clears every pane in it at once.
  - A bell in a tab that is already visible, with the Tabby window focused, clears 2 seconds after the last bell. Each new bell restarts the 2 seconds.
  - A bell while the Tabby window is unfocused stays until the window has focus again. If its tab is active then, it clears 2 seconds later, so the user can see which tab rang.
- Works whatever Tabby's own bell setting is (off, visual, audible). There is no plugin setting; users turn the feature off by disabling the plugin.
- Tabby's own bell behaviour (sound, visual bell, activity line, frame flash) is unchanged.

## Capabilities

### New Capabilities
- `tab-bell-indicator`: showing, passing up from split panes, and clearing a bell icon on Tabby tab headers when a terminal rings the bell.

### Modified Capabilities
<!-- None: no specs exist yet. -->

## Impact

- **New code**: the whole plugin (`package.json`, `webpack.config.mjs`, `tsconfig.json`, vitest config, `src/`), plus `README.md`, `LICENSE`, `doc/TESTING.md`.
- **Tabby APIs used (public)**: `TerminalDecorator` and `BaseTerminalTabComponent.frontend.bell$` (tabby-terminal); `AppService` (`tabs`, `activeTab`, `getParentTab`, `activeTabChange$`, `tabsChanged$`, `tabDragActive$`), `BaseTabComponent.focused$`/`destroyed$`, `SplitTabComponent.getAllTabs()` and `LogService` (tabby-core). Returning to the window needs no extra API: `AppService` already re-emits `focused$` on the active tab when the window regains focus, and `activeTabChange$` tells opening a tab apart from returning to the window.
- **Tabby internals used**: the tab bar's DOM structure (`.tabs > tab-header`, `.pin-indicator`, `.name`), because Tabby has no extension point for tab-header content. All of it is confined to `src/tabbyAdapter.ts`. A Tabby update that changes the tab-header template can break the icon without breaking anything else.
- **Runtime dependencies**: none bundled. Angular, RxJS and `tabby-*` come from the host. Font Awesome 6 is already loaded by Tabby.
