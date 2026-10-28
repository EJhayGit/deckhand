import type { Register } from 'claude-code'

import { refreshDeck } from '../src/agents/library'
import { DECK, renderDeck } from '../src/ui/deck'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refreshDeck($)
    void $.ui.open(DECK)

    return started
  })

  on('ui.render', { component: 'Pane', requestId: DECK.id }, ($, e) => renderDeck($, e))
}
