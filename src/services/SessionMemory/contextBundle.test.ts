import { describe, expect, test } from 'bun:test'
import { buildSessionMemoryContextBundle } from './contextBundle.js'

describe('buildSessionMemoryContextBundle', () => {
  test('uses the dedicated session memory prompt and auxiliary contexts', () => {
    const sourceClaudeMd = [
      'Codebase and user instructions are shown below.',
      '',
      'Contents of /repo/AGENTS.md:',
      '',
      '# Build',
      '- Always use bun',
      'Narrative detail. '.repeat(80),
    ].join('\n')
    const sourceGitStatus = [
      'This is the git status at the start of the conversation.',
      'Current branch: feature/test',
      'Main branch (you will usually use this for PRs): main',
      `Status:\n${Array.from({ length: 35 }, (_, index) => `M src/file-${index}.ts`).join('\n')}`,
      `Recent commits:\n${Array.from({ length: 10 }, (_, index) => `${index}abc commit ${index}`).join('\n')}`,
    ].join('\n\n')

    const result = buildSessionMemoryContextBundle({
      userContext: {
        claudeMd: sourceClaudeMd,
      },
      systemContext: {
        gitStatus: sourceGitStatus,
      },
    })

    expect(result.systemPrompt.join('\n')).toContain(
      'session-memory maintenance agent',
    )
    expect(result.userContext.claudeMd!.length).toBeLessThan(sourceClaudeMd.length)
    expect(result.systemContext.gitStatus!.length).toBeLessThan(sourceGitStatus.length)
  })
})
