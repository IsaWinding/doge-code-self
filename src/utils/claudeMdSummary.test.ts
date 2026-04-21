import { describe, expect, test } from 'bun:test'
import { summarizeClaudeMdForAuxiliaryTask } from './claudeMdSummary.js'

describe('summarizeClaudeMdForAuxiliaryTask', () => {
  test('returns the original text when it is already small', () => {
    const source = 'Contents of /repo/AGENTS.md:\n\n- Always use bun\n- Keep tests close'

    expect(summarizeClaudeMdForAuxiliaryTask(source, { maxChars: 500 })).toBe(
      source,
    )
  })

  test('keeps key instruction lines while shrinking large multi-file context', () => {
    const source = [
      'Codebase and user instructions are shown below.',
      '',
      'Contents of /repo/AGENTS.md:',
      '',
      '# Build',
      '- Always use bun',
      '- Never use npm test here',
      'This repository contains a lot of additional detail that is useful in the main loop but can be shortened for auxiliary work.',
      'The detailed prose keeps going with many words that are not all critical for an agent-generation side task.',
      '',
      'Contents of /repo/.claude/CLAUDE.md:',
      '',
      '# Coding Style',
      '- Prefer focused modules',
      '- Add targeted tests near the changed file',
      'Long narrative explanation repeated. '.repeat(30),
      '',
      'Contents of /repo/.claude/rules/review.md:',
      '',
      '# Review',
      '- Important: call out behavioural regressions first',
      '- Avoid broad unrelated refactors',
      'Additional narrative text. '.repeat(30),
    ].join('\n')

    const summarized = summarizeClaudeMdForAuxiliaryTask(source, {
      maxChars: 560,
      sectionMaxChars: 140,
    })

    expect(summarized.length).toBeLessThan(source.length)
    expect(summarized).toContain('Condensed project instructions')
    expect(summarized).toContain('Contents of /repo/AGENTS.md:')
    expect(summarized).toContain('- Always use bun')
    expect(summarized).toContain('- Prefer focused modules')
    expect(summarized).toContain('Important: call out behavioural regressions first')
  })
})
