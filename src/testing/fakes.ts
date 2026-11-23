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
}

export class FakeApp {
    activeTab: FakeTab | null = null

    constructor (public tabs: FakeTab[]) { }

    getParentTab (tab: FakeTab): FakeTab | null {
        return this.tabs.find(t => t instanceof FakeSplitTab && t.getAllTabs().includes(tab)) ?? null
    }

    /** Selecting a tab focuses it (and, for a split, all its panes) */
    selectTab (tab: FakeTab): void {
        this.activeTab = tab
        tab.focus()
    }
}

export class FakeWindowFocus implements WindowFocus {
    focused = true

    hasFocus (): boolean {
        return this.focused
    }
}

export function createBellState (app: FakeApp, windowFocus = new FakeWindowFocus()): BellStateService<FakeTab> {
    return new BellStateService(createTabTree<FakeTab>(app, FakeSplitTab), windowFocus)
}
