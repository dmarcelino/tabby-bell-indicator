// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest'
import { Subject, Subscription } from 'rxjs'
import { BellDecorator } from './bellDecorator'
import type { BellStateService } from './bellState'

// tabby-terminal cannot load outside Tabby. This fake keeps the parts of
// TerminalDecorator's contract the decorator relies on.
vi.mock('tabby-terminal', () => ({
    TerminalDecorator: class {
        private subs = new Map<unknown, Subscription[]>()

        detach (terminal: unknown): void {
            for (const s of this.subs.get(terminal) ?? []) {
                s.unsubscribe()
            }
            this.subs.delete(terminal)
        }

        protected subscribeUntilDetached (terminal: unknown, subscription?: Subscription): void {
            if (subscription) {
                this.subs.set(terminal, [...this.subs.get(terminal) ?? [], subscription])
            }
        }
    },
}))

function setup () {
    const bell$ = new Subject<void>()
    const terminal = { frontend: { bell$ } } as any
    const bells = { ring: vi.fn(), forget: vi.fn() }
    const decorator = new BellDecorator(bells as unknown as BellStateService<any>)
    return { bell$, terminal, bells, decorator }
}

describe('BellDecorator', () => {
    it('marks the terminal when its frontend rings the bell', () => {
        const { bell$, terminal, bells, decorator } = setup()
        decorator.attach(terminal)

        bell$.next()

        expect(bells.ring).toHaveBeenCalledWith(terminal)
    })

    it('stops listening and forgets the terminal on detach', () => {
        const { bell$, terminal, bells, decorator } = setup()
        decorator.attach(terminal)

        decorator.detach(terminal)
        bell$.next()

        expect(bells.forget).toHaveBeenCalledWith(terminal)
        expect(bells.ring).not.toHaveBeenCalled()
        expect(bell$.observed).toBe(false)
    })

    it('ignores a terminal without a frontend', () => {
        const { bells, decorator } = setup()

        expect(() => decorator.attach({ frontend: undefined } as any)).not.toThrow()
        expect(bells.ring).not.toHaveBeenCalled()
    })
})
