import { describe, expect, test } from 'bun:test'
import { summarizeGitStatusForAuxiliaryTask } from './gitStatusSummary.js'

describe('summarizeGitStatusForAuxiliaryTask', () => {
  test('returns original status when already small', () => {
    const source = [
      'This is the git status at the start of the conversation.',
      'Current branch: main',
      'Main branch (you will usually use this for PRs): main',
      'Status:\nM src/app.ts',
    ].join('\n\n')

    expect(summarizeGitStatusForAuxiliaryTask(source, { maxChars: 300 })).toBe(
      source,
    )
  })

  test('keeps branch info and trims large status and commit blocks', () => {
    const source = [
      'This is the git status at the start of the conversation.',
      'Current branch: feature/optimize',
      'Main branch (you will usually use this for PRs): main',
      'Git user: demo',
      `Status:\n${Array.from({ length: 18 }, (_, index) => `M src/file-${index}.ts`).join('\n')}`,
      `Recent commits:\n${Array.from({ length: 6 }, (_, index) => `${index}abcd commit ${index}`).join('\n')}`,
    ].join('\n\n')

    const summarized = summarizeGitStatusForAuxiliaryTask(source, {
      maxChars: 420,
      maxStatusLines: 5,
      maxCommitLines: 2,
    })

    expect(summarized.length).toBeLessThan(source.length)
    expect(summarized).toContain('Current branch: feature/optimize')
    expect(summarized).toContain('Main branch (you will usually use this for PRs): main')
    expect(summarized).toContain('... (13 more paths omitted)')
    expect(summarized).toContain('... (4 more commits omitted)')
  })
})
