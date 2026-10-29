import { expect, test } from 'claude-code/testing'

import { NONE, applyVerdicts, brakeText, changedFiles, fixesText, isPicked, joinReviews, keyOf, mergeFindings, parseFindings, progress, reportText, reviewPrompt, reviewersFor, roundsCap, securityTrigger, togglePick } from '../src/findings'
import type { Finding } from '../types'

const line = (o: Record<string, unknown>) => JSON.stringify({ severity: 'high', file: 'src/a.ts', line: 3, title: 'Bug', evidence: 'x = y', reviewer: 'reviewer', ...o })

test('the same snippet with a different line or title is one finding, with every reviewer', () => {
  const merged = mergeFindings(parseFindings([
    line({ line: 3, title: 'Null deref', evidence: 'user.name.trim()' }),
    line({ line: 5, title: 'Crash on empty user', evidence: '  user.name.trim( )'.replace('( )', '()'), reviewer: 'typescript-reviewer' }),
    line({ severity: 'low', title: 'Naming', evidence: 'let tmp = 1' }),
  ].join('\n')))

  expect(merged).toHaveLength(2)
  expect(merged[0]!.reviewers).toEqual(['reviewer', 'typescript-reviewer'])
  expect(merged[0]!.title).toBe('Null deref')
  expect(merged.map(f => f.id)).toEqual([1, 2])
})

test('different severities: the strictest wins; serious ones wait for the skeptic, the rest are advice', () => {
  const merged = mergeFindings(parseFindings([
    line({ severity: 'medium', evidence: 'exec(cmd)' }),
    line({ severity: 'critical', evidence: 'exec(cmd)', reviewer: 'security-auditor', title: 'Shell injection' }),
    line({ severity: 'low', evidence: 'var a' }),
  ].join('\n')))

  expect(merged[0]!.severity).toBe('critical')
  expect(merged[0]!.title).toBe('Shell injection')
  expect(merged[0]!.verdict).toBe('pending')
  expect(merged[0]!.reviewers).toEqual(['reviewer', 'security-auditor'])
  expect(merged[1]!.verdict).toBe('advice')
})

test('malformed or incomplete lines fail; an empty review fails; NO FINDINGS is a clean review', () => {
  expect(() => parseFindings(`${line({})}\nnot json`)).toThrow(/line 2 isn't a finding/)
  expect(() => parseFindings(line({ evidence: '' }))).toThrow(/missing/)
  expect(() => parseFindings(line({ severity: 'urgent' }))).toThrow(/missing/)
  expect(() => parseFindings('  ')).toThrow(/no result/)
  expect(parseFindings(NONE)).toEqual([])
  expect(parseFindings(`\`\`\`\n${line({})}\n\`\`\``)).toHaveLength(1)
})

test('the skeptic refutes by default: only a confirmed verdict with quoted proof stands', () => {
  const merged = mergeFindings(parseFindings([
    line({ evidence: 'a()', title: 'A' }),
    line({ evidence: 'b()', title: 'B' }),
    line({ evidence: 'c()', title: 'C' }),
    line({ evidence: 'd()', title: 'D', severity: 'medium' }),
  ].join('\n')))
  const judged = applyVerdicts(merged, [
    '{"id":1,"verdict":"confirmed","proof":"a() runs before the check"}',
    '{"id":2,"verdict":"confirmed","proof":""}',
    'I am not sure about 3',
  ].join('\n'))

  expect(judged.map(f => f.verdict)).toEqual(['confirmed', 'refuted', 'refuted', 'advice'])
  const report = reportText(judged)
  expect(report.indexOf('## Confirmed')).toBeLessThan(report.indexOf('## Advice'))
  expect(report).toContain('A (reviewer)')
})

test('security triggers add the security reviewer; TypeScript files add the TypeScript reviewer', () => {
  expect(reviewersFor(['README.md'], '+Some words')).toEqual(['reviewer'])
  expect(reviewersFor(['src/a.ts'], '+const x = 1')).toEqual(['reviewer', 'typescript-reviewer'])
  expect(securityTrigger(['src/auth/login.py'], '')).toBe(true)
  expect(securityTrigger(['src/a.py'], '+subprocess.run(cmd, shell=True)')).toBe(true)
  expect(securityTrigger(['src/a.py'], '+password = input()')).toBe(true)
  expect(securityTrigger(['src/a.py'], ' token unchanged context\n+x = 1')).toBe(false)
  expect(reviewersFor(['src/api.tsx'], '+await fetch(url)')).toEqual(['reviewer', 'typescript-reviewer', 'security-auditor'])
})

test('changed files from git status, renames by their new name', () => {
  expect(changedFiles(' M src/a.ts\n?? new.md\nR  old.ts -> src/b.ts\n')).toEqual(['src/a.ts', 'new.md', 'src/b.ts'])
})

test('the review prompt starts each reviewer in the foreground; their answers join into one review', () => {
  const prompt = reviewPrompt('Step 4/5: Review.', 'r/04-review.diff', ['new.ts'], [{ name: 'security-auditor', type: 'deckhand:security-auditor' }])
  expect(prompt).toContain('Review the change in r/04-review.diff.')
  expect(prompt).toContain('read them too): new.ts')
  expect(prompt).toContain('`deckhand:security-auditor` (reviewer name: security-auditor)')
  expect(prompt).toContain('not in the background')
  expect(prompt).toContain(`if it found nothing, exactly: ${NONE}`)
  expect(prompt).toContain('reply only: Done.')
  expect(joinReviews([NONE, line({}), ' no findings '])).toBe(line({}))
  expect(joinReviews([NONE, NONE])).toBe(NONE)
  expect(parseFindings(joinReviews([line({}), line({ evidence: 'z' })]))).toHaveLength(2)
})

const f = (id: number, severity: Finding['severity'], evidence: string, extra: Partial<Finding> = {}): Finding =>
  ({ id, severity, file: 'src/a.ts', line: id, title: `T${id}`, evidence, reviewers: ['reviewer'], verdict: severity === 'low' || severity === 'medium' ? 'advice' : 'confirmed', ...extra })

test('fix picks: medium and up are ticked, low and refuted are not, and a toggle wins', () => {
  const all = [f(1, 'critical', 'a'), f(2, 'high', 'b', { verdict: 'refuted' }), f(3, 'medium', 'c'), f(4, 'low', 'd')]
  expect(all.map(isPicked)).toEqual([true, false, true, false])
  const toggled = togglePick(togglePick(all, 1), 4)
  expect(toggled.map(isPicked)).toEqual([false, false, true, true])
  const text = fixesText(toggled, ' keep it small ')
  expect(text).toContain('[medium] src/a.ts:3 T3')
  expect(text).toContain('[low] src/a.ts:4 T4')
  expect(text).not.toContain('T1')
  expect(text).toContain('## Owner\'s note\n\nkeep it small')
})

test('progress: clean, again, the same back, no drop, rising, and the cap', () => {
  const prev = [f(1, 'medium', 'a'), f(2, 'medium', 'b')]
  expect(progress(prev, [], 1, 3)).toEqual({ kind: 'clean' })
  expect(progress(prev, [f(9, 'low', 'z')], 1, 3)).toEqual({ kind: 'clean' })
  expect(progress(prev, [f(1, 'medium', 'a')], 1, 3)).toEqual({ kind: 'again' })
  expect(progress(prev, [f(1, 'medium', 'a')], 3, 3)).toEqual({ kind: 'cap' })
  expect(progress(prev, [f(7, 'high', ' a '), f(8, 'medium', 'b')], 1, 3)).toEqual({ kind: 'stuck', reason: 'the same findings came back' })
  // One fixed, one new: no rise, but the count didn't drop.
  expect(progress(prev, [f(1, 'medium', 'a'), f(3, 'medium', 'c')], 1, 3)).toEqual({ kind: 'stuck', reason: 'the count didn\'t drop (2 sent, 2 back)' })
  const rising = progress([f(1, 'medium', 'a')], [f(2, 'medium', 'b'), f(3, 'medium', 'c')], 1, 3)
  expect(rising.kind).toBe('rising')
  expect(brakeText(rising, 1, 3)).toContain('rising, 2 new findings and 1 fixed')
  expect(brakeText({ kind: 'again' }, 1, 3)).toBeUndefined()
  // Same file and code, spacing aside, is the same finding; another file isn't.
  expect(keyOf(f(1, 'low', 'a  b'))).toBe(keyOf({ file: 'src/a.ts', evidence: 'a b' }))
  expect(keyOf({ file: 'src/b.ts', evidence: 'a b' })).not.toBe(keyOf({ file: 'src/a.ts', evidence: 'a b' }))
})

test('the round cap is 3 by default, 1 to 5', () => {
  expect([undefined, 0, 1, 4, 9].map(roundsCap)).toEqual([3, 1, 1, 4, 5])
})
