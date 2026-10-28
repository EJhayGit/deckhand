import type { Agent } from './format'

export type Starter = { id: string; label: string; agent: Omit<Agent, 'name'> }

const base = { gateway: null, tools: undefined, disallowedTools: undefined }

export const STARTERS: readonly Starter[] = [
  {
    id: 'reviewer',
    label: 'Reviewer',
    agent: {
      ...base,
      description: 'Reviews code and points out bugs and risks without changing anything.',
      model: 'haiku',
      effort: 'medium',
      color: 'blue',
      icon: '🔍',
      limits: { edit: false, run: false, internet: false },
      body: 'Review the code I point you to. List real bugs and risks first, most serious first, with file and line. Change nothing.\n',
    },
  },
  {
    id: 'fixer',
    label: 'Bug fixer',
    agent: {
      ...base,
      description: 'Fixes the bug you describe with the smallest change.',
      model: 'sonnet',
      effort: 'medium',
      color: 'orange',
      icon: '🛠️',
      limits: { edit: true, run: true, internet: false },
      body: 'Fix the bug I describe with the smallest change. Explain what you changed in two sentences.\n',
    },
  },
  {
    id: 'docs',
    label: 'Docs writer',
    agent: {
      ...base,
      description: 'Writes and updates docs in plain words.',
      model: 'haiku',
      effort: 'low',
      color: 'green',
      icon: '📝',
      limits: { edit: true, run: false, internet: false },
      body: 'Write or update the docs I ask for. Use plain words and short sentences. Touch only documentation files.\n',
    },
  },
  {
    id: 'tests',
    label: 'Test runner',
    agent: {
      ...base,
      description: 'Runs the tests and reports what failed and why.',
      model: 'haiku',
      effort: 'low',
      color: 'purple',
      icon: '🧪',
      limits: { edit: false, run: true, internet: false },
      body: "Run the project's tests. Report what failed and the likely cause in a few lines. Change nothing.\n",
    },
  },
  {
    id: 'blank',
    label: 'Blank',
    agent: {
      ...base,
      description: '',
      limits: { edit: false, run: false, internet: false },
      body: '',
    },
  },
]
