// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'
import { createTabTree } from './tabTree'
import { FakeApp, FakeSplitTab, FakeTab } from './testing/fakes'

describe('createTabTree', () => {
    it('returns the maximized pane of a split tab', () => {
        const a = new FakeTab('a')
        const b = new FakeTab('b')
        const split = new FakeSplitTab('split', [a, [b]])
        const tree = createTabTree<FakeTab>(new FakeApp([split]), FakeSplitTab)

        expect(tree.maximizedPaneOf(split)).toBeNull()

        split.maximized = b
        expect(tree.maximizedPaneOf(split)).toBe(b)
    })

    it('returns null for a tab that is not split', () => {
        const plain = new FakeTab('plain')
        const tree = createTabTree<FakeTab>(new FakeApp([plain]), FakeSplitTab)

        expect(tree.maximizedPaneOf(plain)).toBeNull()
    })

    it('lists the panes of a split tab and a plain tab', () => {
        const a = new FakeTab('a')
        const b = new FakeTab('b')
        const split = new FakeSplitTab('split', [a, [b]])
        const plain = new FakeTab('plain')
        const tree = createTabTree<FakeTab>(new FakeApp([split, plain]), FakeSplitTab)

        expect(tree.panesOf(split)).toEqual([a, b])
        expect(tree.panesOf(plain)).toEqual([plain])
        expect(tree.topLevelOf(b)).toBe(split)
        expect(tree.topLevelOf(plain)).toBe(plain)
    })
})
