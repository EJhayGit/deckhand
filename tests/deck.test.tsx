import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'deckhand',
  component: 'Pane',
  requestId: 'deck',
  props: {
    title: 'Deck',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the deck opens at session start', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(opened).toEqual(['deck'])
})

test('the empty deck says so, on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /empty/ }))?.text).toBe('Deck is empty')
    await ui.unmount()
  }
})
