// SPDX-License-Identifier: MIT
import { NgModule, NgZone } from '@angular/core'
import { AppService, BaseTabComponent, LogService, SplitTabComponent } from 'tabby-core'
import { TerminalDecorator } from 'tabby-terminal'
import { BellDecorator } from './bellDecorator'
import { BellStateService, documentWindowFocus } from './bellState'
import { createTabTree } from './tabTree'
import { TabHeaderBellRenderer, startTabHeaderBellSync } from './tabbyAdapter'

@NgModule({
    providers: [
        {
            provide: BellStateService,
            useFactory: (app: AppService) => new BellStateService(createTabTree(app, SplitTabComponent), documentWindowFocus),
            deps: [AppService],
        },
        { provide: TerminalDecorator, useClass: BellDecorator, multi: true },
    ],
})
export default class BellNotificationModule {
    constructor (app: AppService, log: LogService, bells: BellStateService<BaseTabComponent>, zone: NgZone) {
        const logger = log.create('bell-notification')
        // log.txt only records the message, not the logger name.
        logger.info('tabby-bell-notification: plugin loaded')

        app.ready$.subscribe(() => {
            const renderer = new TabHeaderBellRenderer({
                root: document,
                tabs: () => app.tabs,
                isRinging: tab => bells.isRinging(tab),
                warn: message => logger.warn(`tabby-bell-notification: ${message}`),
            })
            // The sync loop only touches the DOM, never Angular state, so keep
            // its frames and DOM observers out of Angular's zone; otherwise every
            // tab-bar mutation would trigger app-wide change detection. Triggers
            // arrive in the zone of whoever emits them, so each frame request is
            // made outside it explicitly, and zone.js binds a MutationObserver's
            // callback to the zone it is created in.
            startTabHeaderBellSync({
                renderer,
                triggers: [bells.changed$, app.tabsChanged$, app.activeTabChange$],
                tabDragActive$: app.tabDragActive$,
                requestFrame: cb => zone.runOutsideAngular(() => requestAnimationFrame(() => cb())),
                createObserver: cb => zone.runOutsideAngular(() => new MutationObserver(() => cb())),
            })
        })
    }
}
