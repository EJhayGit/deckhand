// The Pipeline's Review step: who reviews, reviewers' finding lines, merging
// duplicates, and the skeptic's verdicts. Pure: no `$`. Fails closed: a line
// that won't parse throws, and a serious finding the skeptic doesn't prove is
// refuted.
import type { Finding, Severity } from '../types'

export type RawFinding = { severity: Severity; file: string; line: number; title: string; evidence: string; reviewer: string }

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low']
export const NONE = 'NO FINDINGS'

// Auth, secrets, shell commands, network, file paths, permissions.
const TRIGGER = /\b(auth\w*|login|password|passwd|secret\w*|token\w*|api[_-]?key|credential\w*|session|cookie\w*|jwt|oauth|crypto\w*|exec\w*|spawn\w*|child_process|shell|subprocess|eval|fetch|https?|axios|request|socket\w*|url|path\.(join|resolve)|readFile\w*|writeFile\w*|unlink\w*|chmod|chown|sudo|permission\w*|role\w*)\b/i

export function securityTrigger(files: readonly string[], diff: string): boolean {
  const changed = diff.split(/\r?\n/).filter(l => /^[+-][^+-]/.test(l)).join('\n')
  return files.some(f => TRIGGER.test(f)) || TRIGGER.test(changed)
}

export function reviewersFor(files: readonly string[], diff: string): string[] {
  return [
    'reviewer',
    ...(files.some(f => /\.tsx?$/.test(f)) ? ['typescript-reviewer'] : []),
    ...(securityTrigger(files, diff) ? ['security-auditor'] : []),
  ]
}

// Files named by `git status --porcelain` (renames by their new name).
export function changedFiles(status: string): string[] {
  return status.split(/\r?\n/).filter(l => l.trim() !== '').map(l => l.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, ''))
}

// One JSON object per line; blank lines and code fences are skipped. Throws
// on anything else, so a garbled review fails the step instead of passing.
export function parseFindings(text: string): RawFinding[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '' && !l.startsWith('```'))
  if (lines.length === 0) throw new Error('The review gave no result.')
  if (lines.length === 1 && lines[0]!.toUpperCase() === NONE) return []

  return lines.map((line, i) => {
    let value: Record<string, unknown>
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`Review line ${i + 1} isn't a finding: ${line.slice(0, 80)}`)
    }
    const severity = String(value?.severity ?? '').toLowerCase() as Severity
    const evidence = typeof value?.evidence === 'string' ? value.evidence : ''
    if (!SEVERITIES.includes(severity) || typeof value.file !== 'string' || evidence.trim() === '' || typeof value.title !== 'string' || typeof value.reviewer !== 'string') {
      throw new Error(`Review line ${i + 1} is missing severity, file, title, evidence or reviewer.`)
    }
    return { severity, file: value.file, line: Number(value.line) || 0, title: value.title, evidence, reviewer: value.reviewer }
  })
}

export function normalize(code: string): string {
  return code.replace(/\s+/g, ' ').trim()
}

export function isSerious(f: Pick<Finding, 'severity'>): boolean {
  return f.severity === 'critical' || f.severity === 'high'
}

// Same code snippet, same finding: line numbers and titles drift between
// reviewers, the code doesn't. The strictest severity wins.
export function mergeFindings(raw: readonly RawFinding[]): Finding[] {
  const groups = new Map<string, Finding>()
  for (const r of raw) {
    const key = normalize(r.evidence)
    const had = groups.get(key)
    if (!had) {
      groups.set(key, { id: 0, severity: r.severity, file: r.file, line: r.line, title: r.title, evidence: r.evidence, reviewers: [r.reviewer], verdict: 'advice' })
      continue
    }
    const stricter = SEVERITIES.indexOf(r.severity) < SEVERITIES.indexOf(had.severity)
    groups.set(key, {
      ...had,
      ...(stricter ? { severity: r.severity, title: r.title, file: r.file, line: r.line } : {}),
      reviewers: had.reviewers.includes(r.reviewer) ? had.reviewers : [...had.reviewers, r.reviewer],
    })
  }

  return [...groups.values()]
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
    .map((f, i) => ({ ...f, id: i + 1, verdict: isSerious(f) ? 'pending' : 'advice' }))
}

// The skeptic answers one line per finding: {"id", "verdict", "proof"}. Only a
// "confirmed" with a quoted proof stands; anything else, missing or garbled,
// is refuted.
export function applyVerdicts(findings: readonly Finding[], text: string): Finding[] {
  const said = new Map<number, { verdict: string; proof: string }>()
  for (const line of text.split(/\r?\n/)) {
    try {
      const v = JSON.parse(line.trim())
      if (typeof v?.id === 'number') said.set(v.id, { verdict: String(v.verdict ?? ''), proof: typeof v.proof === 'string' ? v.proof : '' })
    } catch {
      // Not a verdict line: ignored, so its finding stays unproven.
    }
  }

  return findings.map(f => {
    if (f.verdict !== 'pending') return f
    const v = said.get(f.id)
    return v?.verdict.toLowerCase() === 'confirmed' && v.proof.trim() !== ''
      ? { ...f, verdict: 'confirmed', proof: v.proof }
      : { ...f, verdict: 'refuted', proof: v?.proof || undefined }
  })
}

export const FINDING_FORMAT = `{"severity":"high","file":"src/a.ts","line":12,"title":"Token logged in plain text","evidence":"console.log(token)","reviewer":"reviewer"}`

export function reviewPrompt(head: string, diffFile: string, untracked: readonly string[], agents: readonly { name: string; type: string }[]): string {
  const list = agents.map((a, i) => `${i + 1}. \`${a.type}\` (reviewer name: ${a.name})`).join('\n')
  const extra = untracked.length ? `\nNew files not in the diff (read them too): ${untracked.join(', ')}` : ''

  return `${head}

Review the change in ${diffFile}.${extra}

Start every reviewer below now, in one message: one Agent call each, with that
subagent_type, not in the background. Tell each to read the diff file and the
code around it, change nothing, and report every finding as one JSON line
exactly like:
${FINDING_FORMAT}
severity is critical, high, medium or low; evidence is the exact code snippet;
reviewer is its reviewer name. Its whole final answer is only its finding
lines, one per line, with nothing else; if it found nothing, exactly: ${NONE}
Do none of the reviewing yourself.

${list}

When they have all finished, reply only: Done. Deckhand reads their answers
itself.
`
}

// The reviewers' answers as one review: lines from each, none if all found nothing.
export function joinReviews(answers: readonly string[]): string {
  const found = answers.filter(a => a.trim().toUpperCase() !== NONE)
  return found.length ? found.join('\n') : NONE
}

export function skepticPrompt(head: string, diffFile: string, serious: readonly Finding[]): string {
  const list = serious.map(f => `${f.id}. [${f.severity}] ${f.file}:${f.line} ${f.title}\n   evidence: ${normalize(f.evidence)}`).join('\n')

  return `${head}

Check each serious review finding below against the code (the change is in
${diffFile}). For each, quote the code that proves the bug is real, or refute
it. When you are unsure, refute.

${list}

Your whole final answer is one JSON line per finding, nothing else:
{"id":1,"verdict":"confirmed","proof":"<the exact code that proves it>"}
{"id":2,"verdict":"refuted","proof":"<why, or the guard that stops it>"}
`
}

export function reportText(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No findings.'
  const row = (f: Finding) => `- [${f.severity}] ${f.file}:${f.line} ${f.title} (${f.reviewers.join(', ')})${f.proof ? `\n  proof: ${normalize(f.proof)}` : ''}`
  const part = (title: string, of: Finding[]) => (of.length ? `## ${title}\n\n${of.map(row).join('\n')}\n` : '')

  return [
    part('Confirmed', findings.filter(f => f.verdict === 'confirmed')),
    part('Advice', findings.filter(f => f.verdict === 'advice')),
    part('Refuted', findings.filter(f => f.verdict === 'refuted')),
  ].filter(Boolean).join('\n')
}

export function fixNote(findings: readonly Finding[]): string {
  return `Fix these review findings first:\n${findings.filter(f => f.verdict === 'confirmed').map(f => `- ${f.file}:${f.line} ${f.title}`).join('\n')}`
}
