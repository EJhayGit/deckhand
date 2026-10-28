// The New and Edit agent form, drawn in the Deck panel.
import { atom, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { Draft, View } from '../../types'

const view = atom({ plugin: 'deckhand', key: 'view' } as const, { kind: 'deck' } as View)

export function renderForm($: EngineInterface, e: RenderInput, draft: Draft) {
  const { Box, Text, Button } = $.ui.resolve(e)

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{draft.editing ? `Edit ${draft.editing}` : 'New agent'}</Text>
      <Button key="cancel" label="Cancel" onPress={() => update($, view, () => ({ kind: 'deck' }))} />
    </Box>
  )
}
