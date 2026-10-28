// A pixel buddy per agent, as an SVG string: its body in the agent's color,
// a hat by role. Pure: no `$`.
import type { Hat } from '../../types'

// 14 x 9 body: b = body, e = eye.
const BODY = [
  '..bbbbbbbbbb..',
  '..bbbbbbbbbb..',
  '..bbebbbbebb..',
  'bbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbb',
  '..bbbbbbbbbb..',
  '..bbbbbbbbbb..',
  '..b.b....b.b..',
  '..b.b....b.b..',
]

// 14 x 3 hats over the body: h = hat, k = accent.
const HATS: Record<Hat, { rows: string[]; color: string }> = {
  cap: { rows: ['....hhhhhh....', '...hhhhhhhh...', '..hhhhhhhhhhhh'], color: '#3e63dd' },
  hardhat: { rows: ['.....hhhh.....', '...hhhhhhhh...', '.hhhhhhhhhhhh.'], color: '#ffc53d' },
  headphones: { rows: ['...hhhhhhhh...', '..h........h..', '.kk........kk.'], color: '#5b5bd6' },
  beret: { rows: ['.......h......', '...hhhhhhh....', '..hhhhhhhhh...'], color: '#d6409f' },
  antenna: { rows: ['.......k......', '.......h......', '.......h......'], color: '#8b8d98' },
  crown: { rows: ['...k..h..k....', '...hhhhhhh....', '...hhhhhhh....'], color: '#ffc53d' },
  none: { rows: ['..............', '..............', '..............'], color: '' },
}

const ACCENT = '#e5484d'
const EYE = '#1c1c1f'

export function mascotSvg(body: string, hat: Hat): string {
  const top = HATS[hat]
  const fill: Record<string, string> = { b: body, e: EYE, h: top.color, k: ACCENT }
  const rows = [...top.rows, ...BODY]
  const rects = rows.flatMap((row, y) =>
    [...row].flatMap((c, x) => (fill[c] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill[c]}"/>`] : [])),
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 12" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
