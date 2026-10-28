import type { EngineInterface, RenderInput } from 'claude-code'

export const DECK = { id: 'deck', title: 'Deck' }

// A function declaration: validate only follows `$` past an import into one.
export function renderDeck($: EngineInterface, e: RenderInput) {
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Text dimColor>Deck is empty</Text>
    </Box>
  )
}
