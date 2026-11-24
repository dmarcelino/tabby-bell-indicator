// SPDX-License-Identifier: MIT
import { Injectable } from '@angular/core'
import { BaseTerminalTabComponent, TerminalDecorator } from 'tabby-terminal'
import { BellStateService } from './bellState'

/**
 * Marks a terminal when it rings the bell. Listens to xterm's bell event, so a
 * BEL that only terminates a control sequence (e.g. an OSC title) is ignored.
 */
@Injectable()
export class BellDecorator extends TerminalDecorator {
    constructor (private bells: BellStateService<BaseTerminalTabComponent<any>>) {
        super()
    }

    attach (terminal: BaseTerminalTabComponent<any>): void {
        const frontend = terminal.frontend
        if (!frontend) {
            return
        }
        this.subscribeUntilDetached(terminal, frontend.bell$.subscribe(() => this.bells.ring(terminal)))
    }

    detach (terminal: BaseTerminalTabComponent<any>): void {
        this.bells.forget(terminal)
        super.detach(terminal)
    }
}
