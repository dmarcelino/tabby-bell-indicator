// SPDX-License-Identifier: MIT
import { Observable, Subject, Subscription, defer, fromEvent, map, takeUntil } from 'rxjs'

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
    /** Emits when another top-level tab becomes active, before Tabby focuses it */
    readonly activeTabChange$: Observable<unknown>
    /** The top-level tab that contains `pane` (`pane` itself when it is top-level) */
    topLevelOf (pane: T): T
    /** Every pane inside a top-level tab, at any nesting depth (`[tab]` when it is not split) */
    panesOf (tab: T): readonly T[]
    /** The pane maximized inside a top-level split tab, or `null` (always `null` when `tab` is not split) */
    maximizedPaneOf (tab: T): T | null
}

export interface WindowFocus {
    hasFocus (): boolean
    /** Emits when the window may have lost focus; check `hasFocus()` to be sure */
    readonly blurred$: Observable<void>
}

export const documentWindowFocus: WindowFocus = {
    hasFocus: () => document.hasFocus(),
    // Deferred so that importing this module doesn't need a DOM.
    blurred$: defer(() => fromEvent(window, 'blur')).pipe(map(() => undefined)),
}

interface PaneBell {
    /** Pending 2 s auto-clear, if any */
    timer: ReturnType<typeof setTimeout> | null
    /**
     * The next focus event while the tab is seen comes from the user opening the tab, so it clears
     * the bell at once. Otherwise it comes from returning to the window (or clicking the active tab)
     * and starts the 2 s instead.
     */
    mustOpen: boolean
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
 * - Opening the tab clears every pane in it at once, including panes hidden
 *   behind a maximized one. Tabby focuses every pane of a split tab when the
 *   tab is selected, right after `activeTabChange$`, which marks the panes
 *   involved as *must open*.
 * - Tabby also focuses the active tab when the window regains focus. The active
 *   tab did not change then, so the bell is not cleared at once: the 2 s start
 *   again, so the user can see which tab rang. A pane still hidden behind a
 *   maximized pane when they end keeps its bell.
 * - A tab that becomes active while the window is unfocused has not been seen,
 *   so returning to the window starts the 2 s rather than clearing it.
 * - Losing window focus stops every pending 2 s; they start again on return.
 * - `focused$` while the tab is not seen does nothing: Tabby also emits it
 *   for panes in background tabs, e.g. when a sibling pane is closed.
 */
export class BellStateService<T extends BellTab = BellTab> {
    private ringing = new Map<T, PaneBell>()
    private watched = new Map<T, Subscription>()
    private changed = new Subject<void>()

    /** Emits whenever the set of panes with an unseen bell changes */
    readonly changed$: Observable<void> = this.changed.asObservable()

    constructor (
        private tree: TabTree<T>,
        private windowFocus: WindowFocus,
    ) {
        // A singleton that lives as long as the app, so these subscriptions are never dropped.
        tree.activeTabChange$.subscribe(() => this.onActiveTabChanged())
        windowFocus.blurred$.subscribe(() => this.onWindowBlurred())
    }

    ring (pane: T): void {
        this.watch(pane)
        const previous = this.ringing.get(pane)
        this.cancelTimer(pane)
        this.ringing.set(pane, {
            timer: this.isOnScreen(pane) ? this.startTimer(pane) : null,
            mustOpen: (previous?.mustOpen ?? false) || !this.isTabActive(pane),
        })
        if (!previous) {
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

    private startTimer (pane: T): ReturnType<typeof setTimeout> {
        return setTimeout(() => this.expire(pane), BELL_CLEAR_DELAY_MS)
    }

    private expire (pane: T): void {
        const bell = this.ringing.get(pane)
        if (!bell) {
            return
        }
        bell.timer = null
        if (this.isOnScreen(pane)) {
            this.clear(pane)
        }
    }

    /** Whether the pane's top-level tab is the active tab, whether or not the window has focus */
    private isTabActive (pane: T): boolean {
        const active = this.tree.activeTab()
        return active !== null && this.tree.topLevelOf(pane) === active
    }

    /** Whether the pane's top-level tab is the active tab of a focused window */
    private isTabSeen (pane: T): boolean {
        return this.isTabActive(pane) && this.windowFocus.hasFocus()
    }

    /** Whether the pane's tab is seen and the pane is not hidden behind another maximized pane */
    private isOnScreen (pane: T): boolean {
        if (!this.isTabSeen(pane)) {
            return false
        }
        const maximized = this.tree.maximizedPaneOf(this.tree.topLevelOf(pane))
        return maximized === null || maximized === pane
    }

    private onActiveTabChanged (): void {
        const windowFocused = this.windowFocus.hasFocus()
        for (const [pane, bell] of this.ringing) {
            // Panes left behind must be opened again. In the new active tab, the focus event that
            // follows is the user opening it, unless the window is unfocused: then the tab became
            // active without the user seeing it, and returning to the window starts the 2 s instead.
            bell.mustOpen = !this.isTabActive(pane) || windowFocused
        }
    }

    private onWindowBlurred (): void {
        if (this.windowFocus.hasFocus()) {
            return
        }
        for (const [pane, bell] of this.ringing) {
            if (bell.timer) {
                this.cancelTimer(pane)
                bell.timer = null
            }
        }
    }

    private onFocused (pane: T): void {
        const bell = this.ringing.get(pane)
        if (!bell || !this.isTabSeen(pane)) {
            return
        }
        if (bell.mustOpen) {
            // The user opened the tab.
            this.clear(pane)
        } else if (bell.timer === null) {
            // The tab was already active: the window regained focus, or a pane or the tab was
            // clicked. Start the timer even if the pane looks hidden now: focusing a pane in Tabby
            // emits focused$ before un-maximizing the split, and `expire` checks again.
            // A pending timer is left alone, so repeated focus events don't keep pushing it back.
            bell.timer = this.startTimer(pane)
        }
    }

    private cancelTimer (pane: T): void {
        const timer = this.ringing.get(pane)?.timer
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
