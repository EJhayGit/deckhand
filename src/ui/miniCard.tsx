// A small card for pickers; its own file so deck.tsx and swarm.tsx don't import each other.
import type { EngineInterface, RenderInput } from 'claude-code'

import type { DeckAgent } from '../../types'
import { iconText } from './status'

// A small card for pickers: icon letter and name on one line.
export function renderMiniCard($: EngineInterface, e: RenderInput, card: Pick<DeckAgent, 'agent'>, key: string, onPress: () => unknown) {
  const { Box, Button } = $.ui.resolve(e)

  return (
    <Box key={`mini-${key}`} borderStyle="round" borderDimColor hover={{ borderColor: 'primary' }} paddingX={1}>
      <Button key={key} plain label={`${iconText(card.agent)} ${card.agent.name}`} onPress={() => void onPress()} />
    </Box>
  )
}
