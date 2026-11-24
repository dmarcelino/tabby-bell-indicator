// SPDX-License-Identifier: MIT
import type { Observable } from 'rxjs'
import type { BellTab, TabTree } from './bellState'

/** The parts of `AppService` used to walk the tab tree */
export interface AppTabs<T> {
    readonly activeTab: T | null
    readonly activeTabChange$: Observable<T | null>
    getParentTab (tab: T): T | null
}

/** The parts of `SplitTabComponent` used to walk the tab tree */
export interface SplitTab<T> {
    getAllTabs (): T[]
    getMaximizedTab (): T | null
}

/**
 * Builds a `TabTree` from Tabby's public `AppService` and `SplitTabComponent`.
 * `splitTabClass` is passed in so this can be tested without loading tabby-core.
 */
export function createTabTree<T extends BellTab> (
    app: AppTabs<T>,
    splitTabClass: abstract new (...args: any[]) => SplitTab<T>,
): TabTree<T> {
    const asSplit = (tab: T): SplitTab<T> | null => tab instanceof splitTabClass ? tab as unknown as SplitTab<T> : null
    return {
        activeTab: () => app.activeTab,
        activeTabChange$: app.activeTabChange$,
        topLevelOf: pane => app.getParentTab(pane) ?? pane,
        panesOf: tab => asSplit(tab)?.getAllTabs() ?? [tab],
        maximizedPaneOf: tab => asSplit(tab)?.getMaximizedTab() ?? null,
    }
}
