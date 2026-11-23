// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BELL_CLEAR_DELAY_MS } from './bellState'
import { FakeApp, FakeSplitTab, FakeTab, FakeWindowFocus, createBellState } from './testing/fakes'

describe('BellStateService: split panes pass the bell up to their tab', () => {
    it('shows the bell on the top-level tab for a pane in a nested split', () => {
        const nested = new FakeTab('nested')
        const background = new FakeSplitTab('background', [new FakeTab('a'), [new FakeTab('b'), [nested]]])
        const active = new FakeSplitTab('active', [new FakeTab('c')])
        const app = new FakeApp([active, background])
        app.activeTab = active
        const bells = createBellState(app)

        bells.ring(nested)

        expect(bells.isRinging(background)).toBe(true)
        expect(bells.isRinging(active)).toBe(false)
    })

    it('keeps the bell while any pane still rings', () => {
        const a = new FakeTab('a')
        const b = new FakeTab('b')
        const split = new FakeSplitTab('split', [a, b])
        const app = new FakeApp([split, new FakeSplitTab('other', [])])
        app.activeTab = app.tabs[1]
        const bells = createBellState(app)

        bells.ring(a)
        bells.ring(b)
        bells.clear(a)
        expect(bells.isRinging(split)).toBe(true)

        bells.clear(b)
        expect(bells.isRinging(split)).toBe(false)
    })

    it('follows a ringing pane moved to another tab', () => {
        const moved = new FakeTab('moved')
        const stays = new FakeTab('stays')
        const from = new FakeSplitTab('from', [moved, stays])
        const to = new FakeSplitTab('to', [new FakeTab('x')])
        const app = new FakeApp([from, to, new FakeSplitTab('active', [])])
        app.activeTab = app.tabs[2]
        const bells = createBellState(app)
        bells.ring(moved)

        from.root = [stays]
        to.root = [...to.root, moved]

        expect(bells.isRinging(from)).toBe(false)
        expect(bells.isRinging(to)).toBe(true)
    })

    it('handles a top-level tab that is not split', () => {
        const plain = new FakeTab('plain')
        const app = new FakeApp([plain, new FakeSplitTab('active', [])])
        app.activeTab = app.tabs[1]
        const bells = createBellState(app)

        bells.ring(plain)

        expect(bells.isRinging(plain)).toBe(true)
    })

    it('emits changed$ only when the set of ringing panes changes', () => {
        const pane = new FakeTab('pane')
        const app = new FakeApp([new FakeSplitTab('bg', [pane]), new FakeSplitTab('active', [])])
        app.activeTab = app.tabs[1]
        const bells = createBellState(app)
        const changed = vi.fn()
        bells.changed$.subscribe(changed)

        bells.ring(pane)
        bells.ring(pane)
        expect(changed).toHaveBeenCalledTimes(1)

        bells.clear(pane)
        bells.clear(pane)
        expect(changed).toHaveBeenCalledTimes(2)
    })
})

describe('BellStateService: clearing', () => {
    let windowFocus: FakeWindowFocus

    beforeEach(() => {
        vi.useFakeTimers()
        windowFocus = new FakeWindowFocus()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    function setup () {
        const focusedPane = new FakeTab('focused pane')
        const otherPane = new FakeTab('other pane')
        const visible = new FakeSplitTab('visible', [focusedPane, otherPane])
        const bgPane1 = new FakeTab('bg pane 1')
        const bgPane2 = new FakeTab('bg pane 2')
        const background = new FakeSplitTab('background', [bgPane1, [bgPane2]])
        const app = new FakeApp([visible, background])
        app.activeTab = visible
        const bells = createBellState(app, windowFocus)
        return { app, bells, visible, focusedPane, otherPane, background, bgPane1, bgPane2 }
    }

    describe('focusing a tab clears its bells', () => {
        it('clears every pane when a ringing background tab is selected', () => {
            const { app, bells, background, bgPane1, bgPane2 } = setup()
            bells.ring(bgPane1)
            bells.ring(bgPane2)
            vi.advanceTimersByTime(10_000)
            expect(bells.isRinging(background)).toBe(true)

            app.selectTab(background)

            expect(bells.isPaneRinging(bgPane1)).toBe(false)
            expect(bells.isPaneRinging(bgPane2)).toBe(false)
            expect(bells.isRinging(background)).toBe(false)
        })

        it('clears when the Tabby window regains focus', () => {
            const { bells, visible, focusedPane } = setup()
            windowFocus.focused = false
            bells.ring(focusedPane)

            // Tabby re-emits focused$ on the active tab, which a split passes to every pane.
            windowFocus.focused = true
            visible.focus()

            expect(bells.isRinging(visible)).toBe(false)
        })
    })

    describe('bells in a visible tab clear after 2 seconds', () => {
        it('clears a single bell after 2 seconds', () => {
            const { bells, visible, focusedPane } = setup()
            bells.ring(focusedPane)
            expect(bells.isRinging(visible)).toBe(true)

            vi.advanceTimersByTime(BELL_CLEAR_DELAY_MS - 1)
            expect(bells.isRinging(visible)).toBe(true)

            vi.advanceTimersByTime(1)
            expect(bells.isRinging(visible)).toBe(false)
        })

        it('restarts the 2 seconds on every bell', () => {
            const { bells, visible, focusedPane } = setup()
            bells.ring(focusedPane)
            vi.advanceTimersByTime(1500)
            bells.ring(focusedPane)

            vi.advanceTimersByTime(1500)
            expect(bells.isRinging(visible)).toBe(true)

            vi.advanceTimersByTime(500)
            expect(bells.isRinging(visible)).toBe(false)
        })

        it('clears a pane without keyboard focus in the visible split', () => {
            const { bells, visible, otherPane } = setup()
            bells.ring(otherPane)

            vi.advanceTimersByTime(BELL_CLEAR_DELAY_MS)

            expect(bells.isRinging(visible)).toBe(false)
        })

        it('keeps the bell when the user switches away within 2 seconds', () => {
            const { app, bells, visible, focusedPane, background } = setup()
            bells.ring(focusedPane)
            vi.advanceTimersByTime(1000)
            app.selectTab(background)

            vi.advanceTimersByTime(10_000)
            expect(bells.isRinging(visible)).toBe(true)

            app.selectTab(visible)
            expect(bells.isRinging(visible)).toBe(false)
        })
    })

    describe('bells while the window is unfocused wait for focus', () => {
        it('keeps a bell in the active tab of an unfocused window', () => {
            const { bells, visible, focusedPane } = setup()
            windowFocus.focused = false
            bells.ring(focusedPane)

            vi.advanceTimersByTime(10_000)

            expect(bells.isRinging(visible)).toBe(true)
        })

        it('keeps the bell when the window loses focus during the 2 seconds', () => {
            const { bells, visible, focusedPane } = setup()
            bells.ring(focusedPane)
            vi.advanceTimersByTime(1000)
            windowFocus.focused = false

            vi.advanceTimersByTime(10_000)
            expect(bells.isRinging(visible)).toBe(true)

            windowFocus.focused = true
            visible.focus()
            expect(bells.isRinging(visible)).toBe(false)
        })

        it('keeps a bell in a background tab', () => {
            const { bells, background, bgPane1 } = setup()
            bells.ring(bgPane1)

            vi.advanceTimersByTime(10_000)

            expect(bells.isRinging(background)).toBe(true)
        })
    })

    describe('focus only clears a pane the user can see', () => {
        it('keeps the bell when a pane in a background tab is focused', () => {
            const { bells, background, bgPane1, bgPane2 } = setup()
            bells.ring(bgPane2)

            // Closing bgPane1 makes Tabby focus another pane of that split (removeTab → focusAnyIn),
            // although the split stays in the background.
            background.root = [[bgPane2]]
            bgPane1.destroy()
            bgPane2.focus()

            expect(bells.isPaneRinging(bgPane2)).toBe(true)
            expect(bells.isRinging(background)).toBe(true)
        })

        it('keeps the bell when a pane is focused while the window is unfocused', () => {
            const { bells, visible, focusedPane } = setup()
            windowFocus.focused = false
            bells.ring(focusedPane)

            focusedPane.focus()
            expect(bells.isRinging(visible)).toBe(true)

            windowFocus.focused = true
            focusedPane.focus()
            expect(bells.isRinging(visible)).toBe(false)
        })
    })

    describe('panes hidden by a maximized pane', () => {
        it('keeps a bell in a pane hidden behind a maximized pane', () => {
            const { bells, visible, focusedPane, otherPane } = setup()
            visible.maximized = focusedPane
            bells.ring(otherPane)

            vi.advanceTimersByTime(10_000)

            expect(bells.isPaneRinging(otherPane)).toBe(true)
            expect(vi.getTimerCount()).toBe(0)
        })

        it('clears a bell in the maximized pane after 2 seconds', () => {
            const { bells, visible, focusedPane } = setup()
            visible.maximized = focusedPane
            bells.ring(focusedPane)

            vi.advanceTimersByTime(BELL_CLEAR_DELAY_MS)

            expect(bells.isRinging(visible)).toBe(false)
        })

        it('clears a pane without keyboard focus when nothing is maximized', () => {
            const { bells, visible, otherPane } = setup()
            visible.maximized = null
            bells.ring(otherPane)

            vi.advanceTimersByTime(BELL_CLEAR_DELAY_MS)

            expect(bells.isRinging(visible)).toBe(false)
        })

        it('keeps the bell when another pane is maximized during the 2 seconds', () => {
            const { bells, visible, focusedPane, otherPane } = setup()
            bells.ring(otherPane)
            vi.advanceTimersByTime(1000)
            visible.maximized = focusedPane

            vi.advanceTimersByTime(10_000)

            expect(bells.isPaneRinging(otherPane)).toBe(true)
        })

        it('clears a hidden pane when its tab is selected again', () => {
            const { app, bells, visible, focusedPane, otherPane, background } = setup()
            visible.maximized = focusedPane
            bells.ring(otherPane)

            app.selectTab(background)
            app.selectTab(visible)

            expect(bells.isPaneRinging(otherPane)).toBe(false)
            expect(bells.isRinging(visible)).toBe(false)
        })
    })

    describe('pane lifetime', () => {
        it('forgets a destroyed pane and stops listening to it', () => {
            const { bells, background, bgPane1 } = setup()
            const changed = vi.fn()
            bells.ring(bgPane1)
            bells.changed$.subscribe(changed)

            bells.forget(bgPane1)
            expect(bells.isRinging(background)).toBe(false)
            expect(changed).toHaveBeenCalledTimes(1)

            bgPane1.focus()
            expect(changed).toHaveBeenCalledTimes(1)
            expect(bgPane1.focused$.observed).toBe(false)
        })

        it('forgets a pane when it emits destroyed$', () => {
            const { bells, focusedPane } = setup()
            bells.ring(focusedPane)

            focusedPane.destroy()

            expect(bells.isPaneRinging(focusedPane)).toBe(false)
            expect(focusedPane.focused$.observed).toBe(false)
            expect(vi.getTimerCount()).toBe(0)
        })
    })
})
