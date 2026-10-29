# 0014: The deck as cards, click to place

## Context
The owner wants Deckhand to feel like a deck of cards: visible agent cards, skill cards, and Pipeline steps moving across. The mod API has no drag outside a `Client` surface module (no VS Code), and PLAN.md lists drag as Later.

## Decision
Agent and step cards are fixed-width bordered Boxes in wrapping rows. Placing a card into a task is select-then-place with buttons: Use for the chat, "Put on step" and the step picker for the Pipeline. No new state keys; all existing button keys stay.

## Consequences
- Works the same on the terminal, desktop and VS Code, keyboard included; tests barely change.
- No literal drag; cards in one row can differ in height; emoji icons may misalign borders in some terminals.
- Card width is fixed at 24: `bodyColumns` is only on band components, not the Deck pane.

## Alternatives considered
A `Client` drag module (surface-limited, a second render path); computed grid columns; animated movement via Raster.

## Status
Accepted
