import type { Register } from 'claude-code'

import { DECK, renderDeck } from '../src/ui/deck'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.ui.open(DECK)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: DECK.id }, ($, e) => renderDeck($, e))
}
