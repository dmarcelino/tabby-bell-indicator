// SPDX-License-Identifier: MIT
// Test fakes for the parts of Tabby the plugin uses. Not bundled into the plugin.
import { Subject } from 'rxjs'
import { BellStateService, WindowFocus } from '../bellState'
import { createTabTree } from '../tabTree'

export class FakeTab {
    readonly focused$ = new Subject<void>()
    readonly destroyed$ = new Subject<void>()

    constructor (readonly name: string) { }

    focus (): void {
        this.focused$.next()
    }

    destroy (): void {
        this.destroyed$.next()
        this.destroyed$.complete()
    }
}

/** A nested split container inside a split tab */
export type FakeContainer = (FakeTab | FakeContainer)[]

function flatten (children: FakeContainer): FakeTab[] {
    return children.flatMap(child => Array.isArray(child) ? flatten(child) : [child])
}

export class FakeSplitTab extends FakeTab {
    /** The maximized pane, as `SplitTabComponent.maximize()` sets it */
    maximized: FakeTab | null = null

    constructor (name: string, public root: FakeContainer) {
        super(name)
    }

    getAllTabs (): FakeTab[] {
        return flatten(this.root)
    }

    getMaximizedTab (): FakeTab | null {
        return this.maximized
    }

    /** What Tabby does when a split tab is selected: every pane gets focused$ */
    override focus (): void {
        super.focus()
        for (const pane of this.getAllTabs()) {
            pane.focus()
        }
    }

    /** Like `SplitTabComponent.focus(pane)`: emits focused$ first, then un-maximizes another pane */
    focusPane (pane: FakeTab): void {
        pane.focus()
        if (this.maximized !== pane) {
            this.maximized = null
        }
    }
}

export class FakeApp {
    activeTab: FakeTab | null = null
    readonly activeTabChange$ = new Subject<FakeTab | null>()

    constructor (public tabs: FakeTab[]) { }

    getParentTab (tab: FakeTab): FakeTab | null {
        return this.tabs.find(t => t instanceof FakeSplitTab && t.getAllTabs().includes(tab)) ?? null
    }

    /**
     * Like `AppService.selectTab`: selecting another tab emits `activeTabChange$`
     * before focusing it (and, for a split, all its panes). Selecting the tab
     * that is already active only focuses it again.
     */
    selectTab (tab: FakeTab): void {
        if (this.activeTab !== tab) {
            this.activeTab = tab
            this.activeTabChange$.next(tab)
        }
        tab.focus()
    }
}

export class FakeWindowFocus implements WindowFocus {
    focused = true
    readonly blurred$ = new Subject<void>()

    hasFocus (): boolean {
        return this.focused
    }

    /** The window loses focus, as the DOM `blur` event reports it */
    blur (): void {
        this.focused = false
        this.blurred$.next()
    }
}

export function createBellState (app: FakeApp, windowFocus = new FakeWindowFocus()): BellStateService<FakeTab> {
    return new BellStateService(createTabTree<FakeTab>(app, FakeSplitTab), windowFocus)
}
