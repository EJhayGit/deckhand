import { expect, test } from 'claude-code/testing'

import { PANE, SURFACES, world } from './world'

test('the deck opens at session start', async ($, on) => {
  const w = world(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(w.opened).toEqual(['deck'])
})

test('the empty deck says so, on terminal and desktop', async ($, on) => {
  world(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /empty/ }))?.text).toBe('Deck is empty')
    await ui.unmount()
  }
})
