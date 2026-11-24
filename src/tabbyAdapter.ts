// SPDX-License-Identifier: MIT
//
// Everything in this file depends on Tabby internals: the DOM that Tabby's
// app root and tab bar render (`app-root .content.main > .tab-bar > .tabs >
// tab-header`, `.pin-indicator`, `.name`) and the Angular CDK drag placeholder
// (`.cdk-drag-placeholder`) that sits in `.tabs` during a tab drag. Tabby has
// no extension point for tab-header content, so the bell icon is kept in sync
// with the DOM from here. Nothing else in the plugin may touch Tabby's DOM.
import { Observable, Subscription, merge } from 'rxjs'

export const INDICATOR_CLASS = 'bell-indicator'
const STYLE_ID = 'tabby-bell-indicator-style'

// tabby-core's appRoot template: `.content.main` is rendered once (after
// AppService.ready$); its child `.tab-bar` is destroyed while the window is
// fullscreen (unless tabs are shown in fullscreen) and recreated, with a new
// `.tabs` and new headers, on leaving fullscreen.
const TAB_BAR_HOST_SELECTOR = 'app-root .content.main'
const CONTAINER_SELECTOR = '.tab-bar > .tabs'
const DRAG_PLACEHOLDER_CLASS = 'cdk-drag-placeholder'

// Matches `.pin-indicator` in tabby-core's tabHeader.component.scss so the bell
// lines up with the pin in both horizontal and vertical tab bars.
const STYLE = `
tab-header .${INDICATOR_CLASS} {
    display: flex;
    align-items: center;
    flex: none;
    font-size: 12px;
    margin: 1px 6px 0 0;
    opacity: 0.8;
}
`

export interface TabHeaderBellRendererOptions<T> {
    /** Document (or element) that contains Tabby's tab bar */
    root: ParentNode
    /** Top-level tabs in tab-bar order (`AppService.tabs`) */
    tabs: () => readonly T[]
    /** Whether a top-level tab should show the bell icon */
    isRinging: (tab: T) => boolean
    warn: (message: string) => void
}

/**
 * Puts a bell icon into each ringing tab's `tab-header`, directly before
 * `.name` (so after `.pin-indicator` when the tab is pinned), and removes it
 * from all others.
 */
export class TabHeaderBellRenderer<T> {
    private warned = new Set<string>()

    constructor (private options: TabHeaderBellRendererOptions<T>) { }

    /**
     * The stable element whose children include `.tab-bar` while the tab bar
     * is shown. Watching it reveals when the tab bar is (re)created.
     */
    findTabBarHost (): Element | null {
        return this.options.root.querySelector(TAB_BAR_HOST_SELECTOR)
    }

    /** The tab bar's container of `tab-header` elements, if rendered */
    findContainer (): Element | null {
        return this.options.root.querySelector(CONTAINER_SELECTOR)
    }

    sync (): void {
        const container = this.findContainer()
        if (!container) {
            // The tab bar is legitimately absent in fullscreen; only a missing
            // host means Tabby's markup is not what we expect.
            if (!this.findTabBarHost()) {
                this.warnOnce('Tabby window content (.content.main) not found; bell icons are not shown')
            }
            return
        }
        if (container.querySelector(`:scope > .${DRAG_PLACEHOLDER_CLASS}`)) {
            // A CDK drag is in progress (even if tabDragActive$ already reported
            // its end): the dragged header is outside the list and a placeholder
            // clone is in it. Leave the DOM alone; when the drag ends, CDK moves
            // the header back, and that mutation triggers a re-sync.
            return
        }
        // Angular's *ngFor renders one tab-header per AppService.tabs entry, in order.
        const headers = Array.from(container.children).filter(el => el.tagName.toLowerCase() === 'tab-header')
        const tabs = this.options.tabs()
        if (headers.length !== tabs.length) {
            // Angular is mid-update or a drag is in progress; a later trigger re-syncs.
            return
        }
        this.ensureStyle()
        headers.forEach((header, i) => this.syncHeader(header, this.options.isRinging(tabs[i])))
    }

    private syncHeader (header: Element, ringing: boolean): void {
        const existing = header.querySelector(`:scope > .${INDICATOR_CLASS}`)
        if (!ringing) {
            existing?.remove()
            return
        }
        const name = header.querySelector(':scope > .name')
        if (!name) {
            this.warnOnce('tab title (.name) not found in tab-header; bell icons are not shown')
            return
        }
        const indicator = existing ?? this.createIndicator(header.ownerDocument)
        if (name.previousElementSibling !== indicator) {
            header.insertBefore(indicator, name)
        }
    }

    private createIndicator (doc: Document): Element {
        const indicator = doc.createElement('div')
        indicator.className = INDICATOR_CLASS
        const icon = doc.createElement('i')
        icon.className = 'far fa-bell'
        indicator.appendChild(icon)
        return indicator
    }

    private ensureStyle (): void {
        const doc = this.findContainer()?.ownerDocument
        if (!doc || doc.getElementById(STYLE_ID)) {
            return
        }
        const style = doc.createElement('style')
        style.id = STYLE_ID
        style.textContent = STYLE
        doc.head.appendChild(style)
    }

    private warnOnce (message: string): void {
        if (!this.warned.has(message)) {
            this.warned.add(message)
            this.options.warn(message)
        }
    }
}

export interface TabHeaderBellSyncOptions {
    renderer: Pick<TabHeaderBellRenderer<unknown>, 'sync' | 'findContainer' | 'findTabBarHost'>
    /** Anything that may change which headers should show the bell */
    triggers: Observable<unknown>[]
    /** `AppService.tabDragActive$`: the dragged tab while dragging, `null` when the drag ends */
    tabDragActive$: Observable<unknown>
    /** Defaults to `requestAnimationFrame`; the caller may run it outside Angular's zone */
    requestFrame?: (callback: () => void) => void
    /** Defaults to `new MutationObserver`; the caller may create it outside Angular's zone */
    createObserver?: (callback: () => void) => Pick<MutationObserver, 'observe' | 'disconnect' | 'takeRecords'>
}

/**
 * Re-syncs the bell icons whenever a trigger fires or Angular changes the tab
 * bar's DOM (including recreating the whole tab bar, e.g. on leaving
 * fullscreen), at most once per animation frame, and not during a tab drag.
 * Unsubscribe the result to stop.
 */
export function startTabHeaderBellSync (options: TabHeaderBellSyncOptions): Subscription {
    const requestFrame = options.requestFrame ?? (cb => requestAnimationFrame(() => cb()))
    const createObserver = options.createObserver ?? (cb => new MutationObserver(() => cb()))

    let scheduled = false
    let dragging = false
    let stopped = false
    // The host only sees `.tab-bar` come and go; the container sees Angular
    // adding, removing and moving headers and their contents.
    const host = followElement(createObserver(() => schedule()), { childList: true })
    const container = followElement(createObserver(() => schedule()), { childList: true, subtree: true })

    const run = (): void => {
        scheduled = false
        if (stopped || dragging) {
            return
        }
        host.follow(options.renderer.findTabBarHost())
        container.follow(options.renderer.findContainer())
        options.renderer.sync()
        // Drop the mutation records caused by our own changes.
        host.observer.takeRecords()
        container.observer.takeRecords()
    }

    const schedule = (): void => {
        if (scheduled || stopped || dragging) {
            return
        }
        scheduled = true
        requestFrame(run)
    }

    const subscription = new Subscription()
    subscription.add(options.tabDragActive$.subscribe(tab => {
        dragging = tab !== null && tab !== undefined
        if (!dragging) {
            schedule()
        }
    }))
    subscription.add(merge(...options.triggers).subscribe(() => schedule()))
    subscription.add(() => {
        stopped = true
        host.observer.disconnect()
        container.observer.disconnect()
    })
    schedule()
    return subscription
}

/** Keeps a MutationObserver attached to whichever element is current */
function followElement (
    observer: Pick<MutationObserver, 'observe' | 'disconnect' | 'takeRecords'>,
    init: MutationObserverInit,
) {
    let observed: Element | null = null
    return {
        observer,
        follow (element: Element | null): void {
            if (element === observed) {
                return
            }
            observer.disconnect()
            observed = element
            if (element) {
                observer.observe(element, init)
            }
        },
    }
}
