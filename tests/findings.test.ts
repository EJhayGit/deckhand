import { expect, test } from 'claude-code/testing'

import { NONE, applyVerdicts, changedFiles, joinReviews, mergeFindings, parseFindings, reportText, reviewerPrompt, reviewersFor, securityTrigger } from '../src/findings'

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

test('each spawned reviewer gets its own prompt; their answers join into one review', () => {
  const prompt = reviewerPrompt('Step 4/5: Review.', 'r/04-review.diff', ['new.ts'], 'security-auditor')
  expect(prompt).toContain('Review the change in r/04-review.diff.')
  expect(prompt).toContain('read them too): new.ts')
  expect(prompt).toContain('reviewer is "security-auditor"')
  expect(prompt).toContain(`answer exactly: ${NONE}`)
  expect(joinReviews([NONE, line({}), ' no findings '])).toBe(line({}))
  expect(joinReviews([NONE, NONE])).toBe(NONE)
  expect(parseFindings(joinReviews([line({}), line({ evidence: 'z' })]))).toHaveLength(2)
})
