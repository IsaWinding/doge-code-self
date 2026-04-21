import { describe, expect, test } from 'bun:test'
import {
  buildLocalToolUseSummary,
  buildToolUseSummaryPromptPayload,
} from './toolUseSummaryGenerator.js'

describe('buildLocalToolUseSummary', () => {
  test('summarizes a single file edit locally', () => {
    expect(
      buildLocalToolUseSummary([
        {
          name: 'Edit',
          input: {
            file_path: 'src/utils/validate.ts',
          },
          output: 'updated',
        },
      ]),
    ).toBe('Edited validate.ts')
  })

  test('summarizes shell test commands locally', () => {
    expect(
      buildLocalToolUseSummary([
        {
          name: 'Bash',
          input: {
            command: 'bun test ./src/utils/queryContext.test.ts',
          },
          output: 'pass',
        },
      ]),
    ).toBe('Ran tests')
  })

  test('collapses multiple file updates into one concise label', () => {
    expect(
      buildLocalToolUseSummary([
        {
          name: 'Read',
          input: {
            file_path: 'src/one.ts',
          },
          output: 'ok',
        },
        {
          name: 'Edit',
          input: {
            file_path: 'src/two.ts',
          },
          output: 'ok',
        },
        {
          name: 'Write',
          input: {
            file_path: 'src/three.ts',
          },
          output: 'ok',
        },
      ]),
    ).toBe('Updated 3 files')
  })

  test('prefers an outcome-oriented label across mixed tools', () => {
    expect(
      buildLocalToolUseSummary([
        {
          name: 'Read',
          input: {
            file_path: 'src/agent.ts',
          },
          output: 'ok',
        },
        {
          name: 'Bash',
          input: {
            command: 'bun test ./src/services/AgentSummary/agentSummary.test.ts',
          },
          output: 'pass',
        },
      ]),
    ).toBe('Ran tests')
  })

  test('returns null when no local heuristic matches', () => {
    expect(
      buildLocalToolUseSummary([
        {
          name: 'UnknownTool',
          input: {
            foo: 'bar',
          },
          output: 'ok',
        },
      ]),
    ).toBeNull()
  })
})

describe('buildToolUseSummaryPromptPayload', () => {
  test('includes the last assistant text and truncates oversized content', () => {
    const payload = buildToolUseSummaryPromptPayload({
      lastAssistantText: 'Need to inspect auth flows and run targeted checks.',
      tools: [
        {
          name: 'Bash',
          input: {
            command: 'bun test',
          },
          output: 'x'.repeat(400),
        },
      ],
    })

    expect(payload).toContain("User's intent")
    expect(payload).toContain('Tools completed:')
    expect(payload).toContain('Tool: Bash')
    expect(payload).toContain('...')
  })
})
