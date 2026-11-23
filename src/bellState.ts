// SPDX-License-Identifier: MIT
import { Observable, Subject, Subscription, takeUntil } from 'rxjs'

/** How long a bell stays visible in a tab the user is already looking at */
export const BELL_CLEAR_DELAY_MS = 2000

/** The parts of a Tabby tab (`BaseTabComponent`) the bell state needs */
export interface BellTab {
    readonly focused$: Observable<void>
    readonly destroyed$: Observable<void>
}

/** Read-only view of Tabby's tab tree, using public `AppService` / `SplitTabComponent` APIs */
export interface TabTree<T extends BellTab = BellTab> {
    /** The active top-level tab, if any */
    activeTab (): T | null
    /** The top-level tab that contains `pane` (`pane` itself when it is top-level) */
    topLevelOf (pane: T): T
    /** Every pane inside a top-level tab, at any nesting depth (`[tab]` when it is not split) */
    panesOf (tab: T): readonly T[]
    /** The pane maximized inside a top-level split tab, or `null` (always `null` when `tab` is not split) */
    maximizedPaneOf (tab: T): T | null
}

export interface WindowFocus {
    hasFocus (): boolean
}

export const documentWindowFocus: WindowFocus = {
    hasFocus: () => document.hasFocus(),
}

/**
 * Tracks which panes have an unseen bell.
 *
 * A tab is *seen* when it is the active top-level tab and the window has focus.
 * A pane is *on screen* when its tab is seen and no other pane of that tab is
 * maximized.
 *
 * - A bell in a pane that is on screen clears 2 s after the last bell, if the
 *   pane is still on screen at that moment.
 * - Any other bell stays until the pane emits `focused$` while its tab is seen.
 *   Tabby focuses every pane of a split tab when the tab is selected, and the
 *   active tab when the window regains focus, so opening a tab clears every
 *   pane in it, including panes hidden behind a maximized one.
 * - `focused$` while the tab is not seen does not clear: Tabby also emits it
 *   for panes in background tabs, e.g. when a sibling pane is closed.
 */
export class BellStateService<T extends BellTab = BellTab> {
    private ringing = new Map<T, ReturnType<typeof setTimeout> | null>()
    private watched = new Map<T, Subscription>()
    private changed = new Subject<void>()

    /** Emits whenever the set of panes with an unseen bell changes */
    readonly changed$: Observable<void> = this.changed.asObservable()

    constructor (
        private tree: TabTree<T>,
        private windowFocus: WindowFocus,
    ) { }

    ring (pane: T): void {
        this.watch(pane)
        const wasRinging = this.ringing.has(pane)
        this.cancelTimer(pane)
        const timer = this.isOnScreen(pane) ? setTimeout(() => this.expire(pane), BELL_CLEAR_DELAY_MS) : null
        this.ringing.set(pane, timer)
        if (!wasRinging) {
            this.changed.next()
        }
    }

    clear (pane: T): void {
        if (!this.ringing.has(pane)) {
            return
        }
        this.cancelTimer(pane)
        this.ringing.delete(pane)
        this.changed.next()
    }

    /** Drops all state for a pane that is being destroyed */
    forget (pane: T): void {
        this.clear(pane)
        this.watched.get(pane)?.unsubscribe()
        this.watched.delete(pane)
    }

    isPaneRinging (pane: T): boolean {
        return this.ringing.has(pane)
    }

    /** Whether a top-level tab has a pane with an unseen bell */
    isRinging (tab: T): boolean {
        return this.tree.panesOf(tab).some(pane => this.ringing.has(pane))
    }

    private expire (pane: T): void {
        this.ringing.set(pane, null)
        if (this.isOnScreen(pane)) {
            this.clear(pane)
        }
    }

    /** Whether the pane's top-level tab is the active tab of a focused window */
    private isTabSeen (pane: T): boolean {
        const active = this.tree.activeTab()
        return active !== null && this.tree.topLevelOf(pane) === active && this.windowFocus.hasFocus()
    }

    /** Whether the pane's tab is seen and the pane is not hidden behind another maximized pane */
    private isOnScreen (pane: T): boolean {
        if (!this.isTabSeen(pane)) {
            return false
        }
        const maximized = this.tree.maximizedPaneOf(this.tree.topLevelOf(pane))
        return maximized === null || maximized === pane
    }

    private onFocused (pane: T): void {
        if (this.isTabSeen(pane)) {
            this.clear(pane)
        }
    }

    private cancelTimer (pane: T): void {
        const timer = this.ringing.get(pane)
        if (timer) {
            clearTimeout(timer)
        }
    }

    private watch (pane: T): void {
        if (this.watched.has(pane)) {
            return
        }
        const subscription = new Subscription()
        subscription.add(pane.focused$.pipe(takeUntil(pane.destroyed$)).subscribe(() => this.onFocused(pane)))
        subscription.add(pane.destroyed$.subscribe(() => this.forget(pane)))
        this.watched.set(pane, subscription)
    }
}
