# tab-bell-indicator Specification

## Purpose

Shows which Tabby tabs have an unseen terminal bell by putting a bell icon in their tab header, so a request for attention is not confused with ordinary output.

## Requirements

### Requirement: Bell rings mark the terminal
When a terminal emits a bell, the plugin SHALL mark that terminal as having an unseen bell. Only real bell events count; a BEL character that terminates a control sequence (such as an OSC title sequence) SHALL NOT mark the terminal.

#### Scenario: Program rings the bell
- **WHEN** a program in a terminal writes BEL (`\x07`) as a standalone character
- **THEN** that terminal is marked as having an unseen bell

#### Scenario: BEL used as an OSC terminator
- **WHEN** a program sets the window title with `ESC ] 0;title BEL`
- **THEN** the terminal is not marked

### Requirement: Bell icon in the tab header
A top-level tab with an unseen bell SHALL show a bell icon (Font Awesome regular bell) in its tab header, placed directly after the pin icon when the tab is pinned, and in the same position before the title when it is not. A tab without an unseen bell SHALL NOT show the icon.

#### Scenario: Bell in an unpinned tab
- **WHEN** an unpinned tab gets an unseen bell
- **THEN** its header shows the bell icon immediately before the tab title

#### Scenario: Bell in a pinned tab
- **WHEN** a pinned tab gets an unseen bell
- **THEN** its header shows the bell icon immediately after the pin icon

#### Scenario: Only the ringing tab shows the icon
- **WHEN** one of several tabs gets an unseen bell
- **THEN** only that tab's header shows the bell icon

### Requirement: Icon follows the tab
The bell icon SHALL stay on the header of the tab it belongs to when tabs are opened, closed or reordered, and SHALL be removed when that tab is closed.

#### Scenario: Tabs reordered
- **WHEN** a tab with an unseen bell is dragged to another position in the tab bar
- **THEN** after the drag the icon is shown on that tab's header at its new position and on no other header

#### Scenario: Another tab closed
- **WHEN** a tab before a ringing tab is closed
- **THEN** the icon stays on the ringing tab's header

#### Scenario: Leaving fullscreen
- **WHEN** a background tab rings the bell while the tab bar is hidden in fullscreen, and the user leaves fullscreen
- **THEN** the rebuilt tab bar shows the icon on that tab without any other event

### Requirement: Split panes pass the bell up to their tab
A top-level tab SHALL show the bell icon while any pane inside it, at any nesting depth, has an unseen bell, and SHALL stop showing it only when no pane inside it has one.

#### Scenario: Bell in a nested pane
- **WHEN** a pane inside a nested split of a background tab rings the bell
- **THEN** the top-level tab's header shows the bell icon

#### Scenario: One of two ringing panes is cleared
- **WHEN** two panes of a tab have unseen bells and one of them is cleared
- **THEN** the tab's header still shows the bell icon

#### Scenario: Ringing pane moved to another tab
- **WHEN** a pane with an unseen bell is moved out of its tab into another tab
- **THEN** the icon is shown on the tab that now contains the pane and is removed from the old tab if no other pane there has an unseen bell

### Requirement: Opening a tab clears its bells
When the user makes a ringing tab the active tab while the Tabby window has focus, the plugin SHALL clear the unseen bell of every pane in that tab, including panes without keyboard focus or hidden behind a maximized pane. A focus event that does not change the active tab SHALL NOT clear a bell at once, and a focus event on a pane whose tab is not active, or while the window is unfocused, SHALL NOT clear it.

#### Scenario: Selecting a ringing background tab
- **WHEN** the user selects a tab whose header shows the bell icon
- **THEN** all panes in that tab are cleared and the icon disappears

#### Scenario: Ringing pane moved into a background tab
- **WHEN** a pane with an unseen bell is moved from the active tab into a background tab, and the user then selects that tab
- **THEN** the pane is cleared and the icon disappears

#### Scenario: Clicking the tab that is already active
- **WHEN** a pane hidden behind a maximized pane of the active split tab has an unseen bell, and the user clicks that tab's header
- **THEN** the icon stays, because the active tab did not change

#### Scenario: Sibling pane closes in a background tab
- **WHEN** a pane in a background split tab has an unseen bell, and another pane of that tab closes so that Tabby moves focus to the ringing pane
- **THEN** the icon stays on the tab until the user opens it

### Requirement: Bells in a visible tab clear after 2 seconds
When a pane on screen rings the bell, the plugin SHALL show the icon and clear it 2 seconds after the last bell, provided the pane is still on screen then. On screen means: its tab is active, the window is focused, and no other pane of the tab is maximized. Each new bell in that pane SHALL restart the 2 seconds.

#### Scenario: Single bell in the visible tab
- **WHEN** a pane in the active tab rings the bell while the window is focused
- **THEN** the icon appears and is removed 2 seconds later

#### Scenario: Repeated bells
- **WHEN** a pane in the active tab rings the bell at 0 s and again at 1.5 s
- **THEN** the icon is still shown at 3 s and is removed at 3.5 s

#### Scenario: Non-focused pane of the visible tab
- **WHEN** a pane that does not have keyboard focus rings the bell in the active split tab while the window is focused
- **THEN** the icon appears and is removed 2 seconds later

#### Scenario: User switches away before 2 seconds
- **WHEN** a pane in the active tab rings the bell and the user selects another tab within 2 seconds
- **THEN** the icon stays on the first tab until that tab is opened again

#### Scenario: Pane hidden behind a maximized pane
- **WHEN** another pane of the active split tab is maximized and a hidden pane rings the bell
- **THEN** the icon stays after 2 seconds, and is cleared when the tab is opened again

#### Scenario: Moving focus to a hidden pane
- **WHEN** a pane hidden behind a maximized pane of the active split tab has an unseen bell, and the user moves focus to that pane so that Tabby shows it
- **THEN** the icon is removed 2 seconds later

#### Scenario: Maximized pane rings
- **WHEN** the maximized pane of the active split tab rings the bell
- **THEN** the icon appears and is removed 2 seconds later

### Requirement: Bells while the window is unfocused show until 2 seconds after focus returns
While the Tabby window is not focused, the plugin SHALL keep every bell and stop any pending 2 seconds. When the window regains focus with a ringing tab active, including a tab that became active while the window was unfocused, the plugin SHALL keep showing the icon so the user can see which tab rang, and SHALL clear each ringing pane 2 seconds later if it is on screen then.

#### Scenario: Bell in the active tab of a background window
- **WHEN** the active tab rings the bell while the Tabby window is unfocused, and 2 seconds pass
- **THEN** the icon is still shown

#### Scenario: Returning to the Tabby window
- **WHEN** the active tab got a bell while the Tabby window was unfocused, and the window regains focus
- **THEN** the icon is still shown right after the window regains focus, and is removed 2 seconds later

#### Scenario: Window loses focus during the 2 seconds
- **WHEN** a pane in the active tab rings the bell while the window is focused, and the window loses focus before 2 seconds have passed
- **THEN** the icon is still shown after the 2 seconds, and is removed 2 seconds after the window regains focus

#### Scenario: Returning before the 2 seconds end
- **WHEN** a pane in the active tab rings the bell at 0 s while the window is focused, the window loses focus at 0.5 s and regains it at 1.9 s
- **THEN** the icon is still shown at 3.8 s and is removed at 3.9 s

#### Scenario: Tab becomes active while the window is unfocused
- **WHEN** a background tab has an unseen bell, and Tabby makes it the active tab while the window is unfocused (for example because the active tab's shell exits), and the window then regains focus
- **THEN** the icon is still shown right after the window regains focus, and is removed 2 seconds later

#### Scenario: Switching away right after returning
- **WHEN** the active tab got a bell while the Tabby window was unfocused, the window regains focus, and the user selects another tab within 2 seconds
- **THEN** the icon stays on the first tab until that tab is opened again

#### Scenario: Hidden pane on returning
- **WHEN** a pane hidden behind a maximized pane of the active split tab got a bell while the Tabby window was unfocused, and the window regains focus
- **THEN** the icon stays after 2 seconds, and is cleared when the tab is opened again

### Requirement: Independent of Tabby's bell setting
The bell icon SHALL work with every value of Tabby's terminal bell setting (off, visual, audible). It SHALL NOT change Tabby's own bell behaviour: sound, visual bell, frame flash and activity line.

#### Scenario: Tabby bell set to off
- **WHEN** Tabby's bell setting is "off" and a background terminal rings the bell
- **THEN** the tab's header shows the bell icon

#### Scenario: Tabby's activity line unaffected
- **WHEN** a background terminal rings the bell
- **THEN** Tabby's activity line is shown as it would be without the plugin, alongside the bell icon

### Requirement: Cross-platform behaviour
The plugin SHALL behave the same on Windows, macOS and Linux, and with the tab bar in any location (top, bottom, left, right).

#### Scenario: Vertical tab bar
- **WHEN** the tab bar is on the left and a background tab rings the bell
- **THEN** the bell icon is shown in that tab's header next to the pin icon position
