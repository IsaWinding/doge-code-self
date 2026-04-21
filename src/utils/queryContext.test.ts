import { describe, expect, test } from 'bun:test'
import {
  assembleEffectiveSystemPromptContext,
  buildSideQuestionFallbackContextBundle,
  fetchSystemPromptPartsWithResolvers,
} from './queryContext.js'
import { shouldBuildDefaultSystemPrompt } from './systemPrompt.js'

describe('fetchSystemPromptPartsWithResolvers', () => {
  test('skips default prompt and system context when custom prompt is provided', async () => {
    let defaultPromptCalls = 0
    let userContextCalls = 0
    let systemContextCalls = 0

    const result = await fetchSystemPromptPartsWithResolvers({
      customSystemPrompt: 'custom prompt',
      resolvers: {
        getDefaultSystemPrompt: async () => {
          defaultPromptCalls++
          return ['default']
        },
        getUserContext: async () => {
          userContextCalls++
          return { claudeMd: 'present' }
        },
        getSystemContext: async () => {
          systemContextCalls++
          return { gitStatus: 'clean' }
        },
      },
    })

    expect(result.defaultSystemPrompt).toEqual([])
    expect(result.userContext).toEqual({ claudeMd: 'present' })
    expect(result.systemContext).toEqual({})
    expect(defaultPromptCalls).toBe(0)
    expect(userContextCalls).toBe(1)
    expect(systemContextCalls).toBe(0)
  })

  test('loads all parts when custom prompt is absent', async () => {
    let defaultPromptCalls = 0
    let userContextCalls = 0
    let systemContextCalls = 0

    const result = await fetchSystemPromptPartsWithResolvers({
      customSystemPrompt: undefined,
      resolvers: {
        getDefaultSystemPrompt: async () => {
          defaultPromptCalls++
          return ['default']
        },
        getUserContext: async () => {
          userContextCalls++
          return { currentDate: 'today' }
        },
        getSystemContext: async () => {
          systemContextCalls++
          return { gitStatus: 'clean' }
        },
      },
    })

    expect(result.defaultSystemPrompt).toEqual(['default'])
    expect(result.userContext).toEqual({ currentDate: 'today' })
    expect(result.systemContext).toEqual({ gitStatus: 'clean' })
    expect(defaultPromptCalls).toBe(1)
    expect(userContextCalls).toBe(1)
    expect(systemContextCalls).toBe(1)
  })
})

describe('shouldBuildDefaultSystemPrompt', () => {
  test('skips default prompt when a custom main-thread agent provides its own prompt', () => {
    const shouldLoad = shouldBuildDefaultSystemPrompt({
      mainThreadAgentDefinition: {
        agentType: 'reviewer',
        whenToUse: 'Review code',
        source: 'userSettings',
        getSystemPrompt: () => 'Agent prompt',
      },
      toolUseContext: {
        options: {
          tools: [],
        },
      },
      customSystemPrompt: undefined,
    })

    expect(shouldLoad).toBe(false)
  })
})

describe('assembleEffectiveSystemPromptContext', () => {
  test('builds the final prompt from custom and append prompts without reintroducing default sections', () => {
    const result = assembleEffectiveSystemPromptContext({
      tools: [],
      customSystemPrompt: 'custom prompt',
      appendSystemPrompt: 'append prompt',
      defaultSystemPrompt: ['default prompt'],
      userContext: { claudeMd: 'present' },
      systemContext: {},
    })

    expect(result.systemPrompt).toEqual(['custom prompt', 'append prompt'])
    expect(result.userContext).toEqual({ claudeMd: 'present' })
    expect(result.systemContext).toEqual({})
  })
})

describe('buildSideQuestionFallbackContextBundle', () => {
  test('builds a lightweight fallback bundle and compresses large auxiliary context', () => {
    const rawClaudeMd = [
      'Contents of /repo/AGENTS.md:',
      '# Build',
      'Use bun for all commands.',
      'Long detail. '.repeat(200),
    ].join('\n')
    const rawGitStatus = [
      'Current branch: feature/side-question',
      'Status:',
      ...Array.from({ length: 60 }, (_, index) => `M src/file-${index}.ts`),
      'Recent commits:',
      ...Array.from(
        { length: 12 },
        (_, index) => `${index}abcd optimize fallback bundle ${index}`,
      ),
    ].join('\n')

    const result = buildSideQuestionFallbackContextBundle({
      userContext: {
        claudeMd: rawClaudeMd,
        currentDate: "Today's date is 2026-04-15.",
      },
      systemContext: {
        gitStatus: rawGitStatus,
      },
      customSystemPrompt: undefined,
      appendSystemPrompt: 'Append instructions',
    })

    expect(result.systemPrompt[0]).toContain('side question')
    expect(result.systemPrompt.at(-1)).toBe('Append instructions')
    expect(result.userContext.currentDate).toBe("Today's date is 2026-04-15.")
    expect(result.userContext.claudeMd?.length).toBeLessThan(rawClaudeMd.length)
    expect(result.systemContext.gitStatus?.length).toBeLessThan(
      rawGitStatus.length,
    )
  })

  test('preserves a custom system prompt when provided', () => {
    const result = buildSideQuestionFallbackContextBundle({
      userContext: {
        currentDate: "Today's date is 2026-04-15.",
      },
      systemContext: {},
      customSystemPrompt: 'Custom fallback prompt',
      appendSystemPrompt: undefined,
    })

    expect(result.systemPrompt).toEqual(['Custom fallback prompt'])
    expect(result.userContext).toEqual({
      currentDate: "Today's date is 2026-04-15.",
    })
    expect(result.systemContext).toEqual({})
  })
})
