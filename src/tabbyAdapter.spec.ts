// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Subject } from 'rxjs'
import { INDICATOR_CLASS, TabHeaderBellRenderer, startTabHeaderBellSync } from './tabbyAdapter'

/**
 * Mirrors tabby-core's appRoot / tabHeader templates: `app-root .content.main`
 * holds `.tab-bar` (an *ngIf, absent in fullscreen) and the tab bodies'
 * `.content`; `.tab-bar > .tabs` holds one `tab-header` per tab;
 * `.pin-indicator` is an *ngIf, which Angular inserts before its anchor
 * comment, just ahead of `.name`.
 */
function tabHeaderHtml (title: string, pinned: boolean): string {
    return `<tab-header>
        <div class="current-tab-indicator"></div>
        <div class="index">1</div>
        ${pinned ? '<div class="pin-indicator"><i class="fas fa-thumbtack"></i></div>' : ''}<!--ngIf pin-->
        <div class="name">${title}</div>
        <div class="buttons"><button>x</button></div>
    </tab-header>`
}

interface FakeTab { title: string, pinned?: boolean }

function tabBarHtml (tabs: FakeTab[]): string {
    return `<div class="tab-bar"><div class="tabs">${tabs.map(t => tabHeaderHtml(t.title, !!t.pinned)).join('')}</div></div><!--ngIf tab-bar-->`
}

function renderTabBar (tabs: FakeTab[]): HTMLElement {
    document.body.innerHTML = `<app-root><div class="window"><div class="content main">${tabBarHtml(tabs)}<div class="content"></div></div></div></app-root>`
    return document.querySelector('.tabs')!
}

function tabBarHost (): HTMLElement {
    return document.querySelector('.content.main')!
}

/** What Angular does on entering fullscreen */
function hideTabBar (): void {
    document.querySelector('.tab-bar')!.remove()
}

/** What Angular does on leaving fullscreen: a fresh tab bar, before the *ngIf anchor */
function showTabBar (tabs: FakeTab[]): HTMLElement {
    tabBarHost().insertAdjacentHTML('afterbegin', tabBarHtml(tabs).replace('<!--ngIf tab-bar-->', ''))
    return document.querySelector('.tabs')!
}

/** What CDK does on drag start: a placeholder clone takes the header's place, the header leaves the list */
function startCdkDrag (header: HTMLElement): HTMLElement {
    const placeholder = header.cloneNode(true) as HTMLElement
    placeholder.classList.add('cdk-drag-placeholder')
    header.replaceWith(placeholder)
    document.body.appendChild(header)
    return placeholder
}

function bellCounts (): number[] {
    return headers().map(h => h.querySelectorAll(`.${INDICATOR_CLASS}`).length)
}

function headers (): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.tabs > tab-header'))
}

function childClasses (header: Element): string[] {
    return Array.from(header.children).map(c => c.className)
}

function setup (tabs: FakeTab[], ringing: Set<FakeTab>) {
    const container = renderTabBar(tabs)
    const warn = vi.fn()
    const renderer = new TabHeaderBellRenderer<FakeTab>({
        root: document,
        tabs: () => tabs,
        isRinging: tab => ringing.has(tab),
        warn,
    })
    return { container, renderer, warn }
}

afterEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
})

describe('TabHeaderBellRenderer', () => {
    it('puts the bell directly before the title of an unpinned tab', () => {
        const tab = { title: 'a' }
        const { renderer } = setup([tab], new Set([tab]))

        renderer.sync()

        expect(childClasses(headers()[0])).toEqual(['current-tab-indicator', 'index', INDICATOR_CLASS, 'name', 'buttons'])
        expect(headers()[0].querySelector(`.${INDICATOR_CLASS} > i`)!.className).toBe('far fa-bell')
    })

    it('puts the bell directly after the pin of a pinned tab', () => {
        const tab = { title: 'a', pinned: true }
        const { renderer } = setup([tab], new Set([tab]))

        renderer.sync()

        expect(childClasses(headers()[0])).toEqual(['current-tab-indicator', 'index', 'pin-indicator', INDICATOR_CLASS, 'name', 'buttons'])
    })

    it('keeps the bell after the pin when the tab is pinned later', () => {
        const tab = { title: 'a' }
        const { renderer } = setup([tab], new Set([tab]))
        renderer.sync()

        // Angular inserts the *ngIf view before its anchor comment.
        const header = headers()[0]
        const anchor = Array.from(header.childNodes).find(n => n.nodeType === Node.COMMENT_NODE)!
        const pin = document.createElement('div')
        pin.className = 'pin-indicator'
        header.insertBefore(pin, anchor)
        renderer.sync()

        expect(childClasses(header)).toEqual(['current-tab-indicator', 'index', 'pin-indicator', INDICATOR_CLASS, 'name', 'buttons'])
    })

    it('marks only the ringing tab', () => {
        const tabs = [{ title: 'a' }, { title: 'b' }, { title: 'c' }]
        const { renderer } = setup(tabs, new Set([tabs[1]]))

        renderer.sync()

        expect(headers().map(h => h.querySelectorAll(`.${INDICATOR_CLASS}`).length)).toEqual([0, 1, 0])
    })

    it('moves the bell with its tab when tabs are reordered', () => {
        const tabs = [{ title: 'a' }, { title: 'b' }, { title: 'c' }]
        const ringing = new Set([tabs[0]])
        const { container, renderer } = setup(tabs, ringing)
        renderer.sync()

        // AppService.tabs reordered; Angular's *ngFor moves the existing header elements.
        tabs.push(tabs.shift()!)
        container.appendChild(headers()[0])
        renderer.sync()

        expect(headers().map(h => h.querySelector('.name')!.textContent)).toEqual(['b', 'c', 'a'])
        expect(headers().map(h => h.querySelectorAll(`.${INDICATOR_CLASS}`).length)).toEqual([0, 0, 1])
    })

    it('removes the bell once the tab is no longer ringing', () => {
        const tab = { title: 'a' }
        const ringing = new Set([tab])
        const { renderer } = setup([tab], ringing)
        renderer.sync()

        ringing.delete(tab)
        renderer.sync()

        expect(document.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
    })

    it('does not add a second bell on repeated syncs', () => {
        const tab = { title: 'a' }
        const { renderer } = setup([tab], new Set([tab]))

        renderer.sync()
        renderer.sync()

        expect(document.querySelectorAll(`.${INDICATOR_CLASS}`)).toHaveLength(1)
    })

    it('skips the sync when the header count does not match the tabs', () => {
        const tabs = [{ title: 'a' }, { title: 'b' }]
        const { renderer } = setup(tabs, new Set([tabs[1]]))

        // Angular has not rendered the new tab's header yet.
        tabs.unshift({ title: 'new' })
        renderer.sync()

        expect(document.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
    })

    it('leaves the DOM alone while a drag placeholder is in the tab list', () => {
        const tabs = [{ title: 'a' }, { title: 'b' }]
        const ringing = new Set([tabs[1]])
        const { renderer } = setup(tabs, ringing)
        renderer.sync()
        const [first, second] = headers()

        // A drag of the first tab is in progress; meanwhile the ringing tab changes.
        const placeholder = startCdkDrag(first)
        ringing.clear()
        ringing.add(tabs[0])
        renderer.sync()

        expect(first.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
        expect(placeholder.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
        expect(second.querySelectorAll(`.${INDICATOR_CLASS}`)).toHaveLength(1)
    })

    it('injects its stylesheet once', () => {
        const tab = { title: 'a' }
        const { renderer } = setup([tab], new Set([tab]))

        renderer.sync()
        renderer.sync()

        const styles = document.head.querySelectorAll('style#tabby-bell-indicator-style')
        expect(styles).toHaveLength(1)
        expect(styles[0].textContent).toContain(`.${INDICATOR_CLASS}`)
    })

    it('does nothing and does not warn while the tab bar is hidden (fullscreen)', () => {
        const tab = { title: 'a' }
        const { renderer, warn } = setup([tab], new Set([tab]))
        hideTabBar()

        expect(() => renderer.sync()).not.toThrow()
        expect(warn).not.toHaveBeenCalled()
        expect(document.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
        expect(document.getElementById('tabby-bell-indicator-style')).toBeNull()
    })

    it('warns once and does not throw when the tab bar host is missing', () => {
        const warn = vi.fn()
        document.body.innerHTML = '<app-root></app-root>'
        const renderer = new TabHeaderBellRenderer({ root: document, tabs: () => [], isRinging: () => true, warn })

        expect(() => { renderer.sync(); renderer.sync() }).not.toThrow()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toContain('.content.main')
    })

    it('ignores a .tabs element outside the tab bar', () => {
        const tab = { title: 'a' }
        const { renderer } = setup([tab], new Set([tab]))
        hideTabBar()
        document.querySelector('.content:not(.main)')!.innerHTML = `<div class="tabs">${tabHeaderHtml('other', false)}</div>`

        renderer.sync()

        expect(document.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
    })

    it('warns once and does not throw when a header has no title element', () => {
        const tab = { title: 'a' }
        const { renderer, warn } = setup([tab], new Set([tab]))
        headers()[0].querySelector('.name')!.remove()

        expect(() => { renderer.sync(); renderer.sync() }).not.toThrow()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(document.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
    })
})

describe('startTabHeaderBellSync', () => {
    function setupSync () {
        const frames: (() => void)[] = []
        const flushFrames = (): void => {
            for (const cb of frames.splice(0)) {
                cb()
            }
        }
        const renderer = {
            sync: vi.fn(),
            findContainer: vi.fn(() => document.querySelector('.tab-bar > .tabs')),
            findTabBarHost: vi.fn(() => document.querySelector('app-root .content.main')),
        }
        const trigger = new Subject<void>()
        const otherTrigger = new Subject<void>()
        const tabDragActive$ = new Subject<unknown>()
        renderTabBar([{ title: 'a' }])
        const subscription = startTabHeaderBellSync({
            renderer,
            triggers: [trigger, otherTrigger],
            tabDragActive$,
            requestFrame: cb => frames.push(cb),
        })
        return { frames, flushFrames, renderer, trigger, otherTrigger, tabDragActive$, subscription }
    }

    it('syncs once at start', () => {
        const { flushFrames, renderer } = setupSync()
        flushFrames()
        expect(renderer.sync).toHaveBeenCalledTimes(1)
    })

    it('batches several triggers into one sync per frame', () => {
        const { flushFrames, renderer, trigger, otherTrigger } = setupSync()
        flushFrames()

        trigger.next()
        otherTrigger.next()
        trigger.next()
        flushFrames()

        expect(renderer.sync).toHaveBeenCalledTimes(2)
    })

    it('pauses during a tab drag and syncs when it ends', () => {
        const { flushFrames, renderer, trigger, tabDragActive$ } = setupSync()
        flushFrames()

        tabDragActive$.next({ dragged: 'tab' })
        trigger.next()
        flushFrames()
        expect(renderer.sync).toHaveBeenCalledTimes(1)

        tabDragActive$.next(null)
        flushFrames()
        expect(renderer.sync).toHaveBeenCalledTimes(2)
    })

    it('does not sync a frame that was already scheduled when a drag started', () => {
        const { flushFrames, renderer, trigger, tabDragActive$ } = setupSync()
        flushFrames()

        trigger.next()
        tabDragActive$.next({ dragged: 'tab' })
        flushFrames()

        expect(renderer.sync).toHaveBeenCalledTimes(1)
    })

    it('stops when unsubscribed', () => {
        const { flushFrames, renderer, trigger, subscription } = setupSync()
        flushFrames()

        subscription.unsubscribe()
        trigger.next()
        flushFrames()

        expect(renderer.sync).toHaveBeenCalledTimes(1)
    })

    it('re-syncs when Angular changes the tab bar, but not after its own changes', async () => {
        const frames: (() => void)[] = []
        const flushFrames = (): void => {
            for (const cb of frames.splice(0)) {
                cb()
            }
        }
        const tabs: FakeTab[] = [{ title: 'a' }]
        const ringing = new Set(tabs)
        const container = renderTabBar(tabs)
        const real = new TabHeaderBellRenderer({ root: document, tabs: () => tabs, isRinging: t => ringing.has(t), warn: vi.fn() })
        const sync = vi.spyOn(real, 'sync')
        startTabHeaderBellSync({ renderer: real, triggers: [], tabDragActive$: new Subject(), requestFrame: cb => frames.push(cb) })

        flushFrames()
        expect(sync).toHaveBeenCalledTimes(1)
        expect(document.querySelectorAll(`.${INDICATOR_CLASS}`)).toHaveLength(1)

        // The renderer's own insertion must not schedule another sync.
        await Promise.resolve()
        expect(frames).toHaveLength(0)

        // Angular adds a header for a new ringing tab.
        const added = { title: 'b' }
        tabs.push(added)
        ringing.add(added)
        container.insertAdjacentHTML('beforeend', tabHeaderHtml('b', false))
        await Promise.resolve()
        expect(frames).toHaveLength(1)

        flushFrames()
        expect(document.querySelectorAll(`.${INDICATOR_CLASS}`)).toHaveLength(2)
    })
    function setupRealSync (tabs: FakeTab[], ringing: Set<FakeTab>) {
        const frames: (() => void)[] = []
        const flushFrames = (): void => {
            for (const cb of frames.splice(0)) {
                cb()
            }
        }
        renderTabBar(tabs)
        const warn = vi.fn()
        const renderer = new TabHeaderBellRenderer({ root: document, tabs: () => tabs, isRinging: t => ringing.has(t), warn })
        const sync = vi.spyOn(renderer, 'sync')
        const changed = new Subject<void>()
        const tabDragActive$ = new Subject<unknown>()
        const subscription = startTabHeaderBellSync({
            renderer,
            triggers: [changed],
            tabDragActive$,
            requestFrame: cb => frames.push(cb),
        })
        return { frames, flushFrames, warn, sync, changed, tabDragActive$, subscription }
    }

    it('shows bells that rang in fullscreen once the tab bar is recreated, and follows the new tab bar', async () => {
        const tabs: FakeTab[] = [{ title: 'a' }, { title: 'b' }]
        const ringing = new Set<FakeTab>()
        const { frames, flushFrames, warn, sync, changed } = setupRealSync(tabs, ringing)
        flushFrames()
        const oldContainer = document.querySelector('.tabs')!

        // Entering fullscreen: Angular destroys the tab bar.
        hideTabBar()
        await Promise.resolve()
        expect(frames).toHaveLength(1)
        flushFrames()
        expect(sync).toHaveBeenCalledTimes(2)

        // A tab rings while the tab bar is hidden.
        ringing.add(tabs[1])
        changed.next()
        flushFrames()
        expect(sync).toHaveBeenCalledTimes(3)
        expect(document.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()

        // Leaving fullscreen: Angular renders a fresh tab bar; no other trigger fires.
        const newContainer = showTabBar(tabs)
        await Promise.resolve()
        expect(frames).toHaveLength(1)
        flushFrames()
        expect(bellCounts()).toEqual([0, 1])
        expect(warn).not.toHaveBeenCalled()

        // The old, detached container is no longer observed...
        oldContainer.insertAdjacentHTML('beforeend', tabHeaderHtml('stale', false))
        await Promise.resolve()
        expect(frames).toHaveLength(0)

        // ...but the new one is: Angular adds a header for a new ringing tab.
        const added = { title: 'c' }
        tabs.push(added)
        ringing.add(added)
        newContainer.insertAdjacentHTML('beforeend', tabHeaderHtml('c', false))
        await Promise.resolve()
        expect(frames).toHaveLength(1)
        flushFrames()
        expect(bellCounts()).toEqual([0, 1, 1])
    })

    it('does not sync mid-drag even after tabDragActive$ reports the end, and re-syncs once the drag really ends', async () => {
        const tabs: FakeTab[] = [{ title: 'a' }, { title: 'b' }]
        const ringing = new Set<FakeTab>([tabs[1]])
        const { frames, flushFrames, sync, changed, tabDragActive$ } = setupRealSync(tabs, ringing)
        flushFrames()
        expect(bellCounts()).toEqual([0, 1])

        // A CDK drag of the first tab starts; then a tab opens, and Tabby's
        // AppRootComponent calls emitTabDragEnded() although the drag goes on.
        tabDragActive$.next(tabs[0])
        const first = headers()[0]
        const placeholder = startCdkDrag(first)
        tabDragActive$.next(null)
        ringing.clear()
        ringing.add(tabs[0])
        changed.next()
        await Promise.resolve()
        flushFrames()
        expect(sync).toHaveBeenCalled()
        expect(first.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
        expect(placeholder.querySelector(`.${INDICATOR_CLASS}`)).toBeNull()
        expect(headers()[1].querySelectorAll(`.${INDICATOR_CLASS}`)).toHaveLength(1)

        // The drag ends: CDK puts the header back in place of the placeholder.
        placeholder.replaceWith(first)
        await Promise.resolve()
        expect(frames).toHaveLength(1)
        flushFrames()
        expect(bellCounts()).toEqual([1, 0])
    })

    it('creates every DOM observer through createObserver', () => {
        renderTabBar([{ title: 'a' }])
        const createObserver = vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn(), takeRecords: vi.fn(() => []) }))
        const frames: (() => void)[] = []
        startTabHeaderBellSync({
            renderer: { sync: vi.fn(), findContainer: () => document.querySelector('.tabs'), findTabBarHost: () => document.querySelector('.content.main') },
            triggers: [],
            tabDragActive$: new Subject(),
            requestFrame: cb => frames.push(cb),
            createObserver,
        })
        frames.splice(0).forEach(cb => cb())

        expect(createObserver).toHaveBeenCalledTimes(2)
        const observed = createObserver.mock.results.flatMap(r => r.value.observe.mock.calls.map((c: unknown[]) => c[0]))
        expect(observed).toEqual(expect.arrayContaining([document.querySelector('.content.main'), document.querySelector('.tabs')]))
    })
})
