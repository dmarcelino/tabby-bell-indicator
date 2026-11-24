# Testing in a running Tabby

Results of manual tests in a real Tabby, as required by `AGENTS.md`. Unit tests (`npm test`) cover the bell state, clearing rules, decorator and DOM renderer with fakes; this file covers what only a running Tabby can show.

## How these tests are driven

Tabby is started with `--remote-debugging-port=<port>`. A small Chrome DevTools Protocol client then:

- evaluates JavaScript in the renderer;
- takes screenshots;
- sends mouse events for real CDK drags.

The test script (not the plugin) gets Tabby's services through `require('@angular/core').getPlatform()` and the root injector. Actions that change tabs must run inside Angular's `NgZone` (`zone.run(...)`), otherwise Angular doesn't re-render. This happened during the first spike run and looked like a plugin bug, but wasn't.

Note: with no argument, `TerminalService.openTab()` opens the **default profile**, which may be an SSH profile. To get a local shell, pass a local profile explicitly.

Two more pitfalls:
- The Tabby window must be visible on screen. While it is covered or on another desktop, Chromium reports `document.visibilityState` as `hidden` and pauses animation frames. Terminal output, Angular's tab-bar animations and the plugin's frame-batched sync all stall, so no icon appears. `getCurrentWindow().show()` makes it visible again.
- Reloading the window to load a new build reopens only the tabs in Tabby's recovery list (`localStorage.tabsRecovery`). Tabs from plugins that don't save a recovery token are lost. Check that list before reloading a Tabby that has tabs worth keeping.

## 2026-11-23: DOM spike (task 2.1)

**Setup**
- Tabby 1.0.238 on macOS. Plugin linked into `plugins/node_modules`, alongside one other user plugin.
- Window 1000×640 with 15 existing tabs.
- Spike build: every tab at an even index shows the bell.

**Check after each step.** A script in the renderer verifies that:
- `.tabs > tab-header` count equals `AppService.tabs.length`;
- each even-index header has exactly one `.bell-indicator` and each odd-index header has none;
- the indicator is directly before `.name`;
- in a pinned tab, the indicator is directly after `.pin-indicator`.

| Step | Result |
|---|---|
| Plugin startup | `log.txt` contains the plugin's startup line |
| Initial render, 15 tabs, tab bar on top | Pass: bells on even indices, before `.name`. Font Awesome regular (`far fa-bell`) renders as an outline bell |
| Open 3 tabs | Pass |
| Pin a tab (Tabby moves it to index 0, shifting every other tab) | Pass: the bell follows the index mapping; pin, then bell, then title |
| Pin a second tab, then unpin it | Pass |
| Move a tab with `moveTabToIndex` | Pass |
| Close a tab | Pass |
| Tab bar on the left (changed in memory, not saved) | Pass. Pin at x=33, bell at x=48, title at x=65, all on the same row (y=39, height 37) |
| Real mouse drag of a tab without a bell (vertical tab bar) | Pass, both mid-drag and after the drop |
| Real mouse drag of a tab with a bell (index 6 to 11) | Pass. Mid-drag, the CDK preview and placeholder both show the bell because they are clones of the header. After the drop, every header is correct |

**Observations**
- With many tabs in a narrow window (about 37px per tab), Tabby clips the header content, including its own pin icon. The bell is clipped the same way. This is how Tabby behaves already, not a plugin issue.
- The drag pause and the placeholder/preview filter work. No sync ran with a wrong mapping during a drag.

**Outcome:** design D4 (index mapping, insert before `.name`, pause during drag) held. No design change needed (task 2.2).

## 2026-11-23: Final build (task 6.3)

**Setup**
- Tabby 1.0.238 on macOS, final build.
- Test tabs opened with an explicit local `/bin/bash` profile.
- Bells sent with `printf '\a'` through the pane's input. The window is blurred and refocused through Electron (`getCurrentWindow().blur()` / `.focus()`).
- Tab bar location and Tabby's bell setting were changed in memory only, then restored.
- Existing tabs were not touched: tab order and active tab were checked as unchanged afterwards.
- The script reads the DOM to check whether each tab header shows `.bell-indicator`.

Tabby's bell setting was **off** for every case except 7.

| # | Case | Result |
|---|---|---|
| 1 | Background tab rings | Pass: icon shown; Tabby's activity line also shown; no other tab marked; still shown after 3 s; cleared on opening the tab |
| 2 | Visible tab rings, window focused | Pass: shown, then cleared about 2 s later |
| 2b | Visible tab rings twice, 1.5 s apart | Pass: still shown 1.2 s after the second bell; cleared about 2.4 s after it |
| 3 | Pane without keyboard focus in the active split rings | Pass: shown on the tab, then cleared after 2 s without focusing the pane |
| 4 | Pane in a nested split (right, then bottom) of a background tab rings | Pass: shown on the top-level tab; cleared on opening the tab |
| 5 | Pinned background tab rings | Pass: icon directly after the pin and before the title; stays on the tab when it is unpinned and moves |
| 6 | Tab bar on the left | Pass: icon shown, vertically centred on the title row; still on the right tab after switching back to top |
| 7 | Tabby bell setting "visual" | Pass: icon shown |
| 8 | `printf '\033]0;bell-osc-test\a'` (BEL ends an OSC title sequence) | Pass: no icon. A real `printf '\a'` in the same shell straight afterwards showed the icon. The shell prompt also sets the title through OSC after every command and never triggered the icon |
| 9 | Active tab rings while the Tabby window is unfocused | Pass: icon still shown after 3 s; cleared when the window regains focus |
| 10 | Window loses focus during the 2 s | Pass: icon stays; cleared when the window regains focus |

**Not tested**
- Windows and Linux. There is no OS-specific code: the DOM, Font Awesome and `document.hasFocus()` are the same in Tabby's Electron renderer on every OS. Only the install and link steps in the README differ per OS, and the Linux and Windows link commands were not run here.
- The bottom and right tab-bar positions. They use the same tab-header layout as top and left.

## 2026-11-23: Review fixes (task 7.7)

**Setup:** as in 6.3. Tabby 1.0.238 on macOS, local `/bin/bash` test tabs, driven over the debug port. The window was reloaded to pick up the new build. `log.txt` shows the startup line and no plugin warnings. Every change below was made in memory only; the window and the existing tabs were restored afterwards.

| Case | Result |
|---|---|
| Smoke: background tab rings, then is opened; visible tab rings | Pass: shown, then cleared on opening; visible tab cleared after about 2 s |
| Pane rings in a background split, then its sibling pane's shell exits (`exit`) | Pass. Tabby closed the sibling and moved focus to the ringing pane. The icon stayed, and was still shown 2.5 s later. It cleared when the tab was opened. Before fix 7.1, that focus event cleared the bell |
| Maximized pane of the active split rings | Pass: shown, then cleared after about 2 s |
| Pane hidden behind a maximized pane rings | Pass: still shown after 3 s; cleared when the tab was opened again |
| Background tab rings in fullscreen (tab bar hidden, `tabsInFullscreen` off), then fullscreen is left | Pass: the tab bar is rebuilt and the icon shows straight away; cleared on opening the tab. No "not found" warning logged |

The sync loop now runs outside Angular's zone (7.5), and icons are still added and removed in all the cases above.

## 2026-11-24: Clear 2 s after returning to the window (task 8.4)

**Setup:** Tabby 1.0.238 on macOS, reloaded to load the new build. `log.txt` shows the startup line and no plugin warnings. Local `/bin/bash` test tabs, driven over the debug port as before. The test tabs were closed afterwards, and the active tab was restored.

**Window focus was simulated.** On macOS a script can't reliably take focus back from another app (`app.focus({ steal: true })` worked only some of the time). So the test simulates focus where the plugin and Tabby read it:
- Losing focus: `document.hasFocus()` is replaced by a stub that returns false, and a DOM `blur` event is dispatched on `window`.
- Returning: the stub returns true again, and `HostWindowService.windowFocused` is fired in Angular's zone, which is what Tabby's own handler does when the main process reports the window focused.

Everything after that is real Tabby code: `AppService` re-emits `focused$` on the active tab, the split forwards it to its panes, and the plugin redraws the tab bar. The real OS path (`windowFocused$` firing after the window really regains focus, with `document.hasFocus()` already true) was tested with the earlier build in 6.3, cases 9 and 10. The real OS `blur` event, which now stops pending timers, was not.

| Case | Result |
|---|---|
| Smoke: background tab rings, then is opened; visible tab rings | Pass: cleared at once on opening; visible tab cleared after about 2 s |
| Active tab rings while the window is unfocused, then the window regains focus | Pass: shown after 3 s unfocused; still shown just after returning and 1.5 s later; cleared about 2.5 s after returning |
| Window loses focus during the 2 s | Pass: stays while unfocused; still shown just after returning; cleared about 2.5 s after returning |
| Window loses focus and returns before the first 2 s end (bell at 0, return at about 1.6 s) | Pass: still shown after the original 2 s; cleared about 2 s after returning |
| Window regains focus, then another tab is selected within 2 s | Pass: the icon stays on the tab left behind; cleared at once when it is opened again |
| Pane hidden behind the maximized (focused) pane rings while the window is unfocused, then the window regains focus | Pass: the split stays maximized and the icon stays after 3 s; cleared when the tab is opened again |
| Focus moved to a hidden pane (`SplitTabComponent.focus`) | Pass: the split un-maximizes; the icon is still shown just after, and cleared about 2 s later |
| Background tab rings, Tabby makes it active while the window is unfocused, then the window regains focus | Pass: kept while unfocused; still shown just after returning; cleared about 2.5 s after returning |

Observation: when a split tab gets focus, Tabby re-focuses its last focused pane and un-maximizes the split if that pane isn't the maximized one. A first run maximized a pane that didn't have focus, so returning to the window un-maximized the split, and the now visible pane cleared after 2 s. That is correct behaviour; the test was changed to maximize the focused pane, as the maximize hotkey does.
