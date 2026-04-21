import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { spawnSync } from 'child_process'
import {
  findCustomModelPreset,
  getCustomModelPresets,
  renderCustomModelPresetList,
} from '../src/utils/customModelPresets.js'
import { resolveCompatibleStorage } from '../src/utils/compatibleApiConfig.js'
import { getSystemPrompt } from '../src/constants/prompts.js'
import { clearSystemPromptSections } from '../src/constants/systemPromptSections.js'
import { enableConfigs } from '../src/utils/config.js'
import { ensureBootstrapMacro } from '../src/bootstrapMacro.js'
import { getOutputStyleConfig } from '../src/constants/outputStyles.js'
import { getSkillToolCommands } from '../src/commands.js'
import { computeSimpleEnvInfo } from '../src/constants/prompts.js'
import {
  buildAuxiliarySystemContext,
  buildAuxiliaryUserContext,
  getUserContext,
} from '../src/context.js'
import { buildSessionMemorySystemPrompt } from '../src/services/SessionMemory/prompts.js'
import {
  buildAgentSummaryContextMessages,
  buildLocalAgentSummary,
} from '../src/services/AgentSummary/agentSummary.js'
import { buildExtractMemoriesContextMessages } from '../src/services/extractMemories/extractMemories.js'
import {
  buildLocalToolUseSummary,
  buildToolUseSummaryPromptPayload,
} from '../src/services/toolUseSummary/toolUseSummaryGenerator.js'
import { summarizeClaudeMdForAuxiliaryTask } from '../src/utils/claudeMdSummary.js'
import { summarizeGitStatusForAuxiliaryTask } from '../src/utils/gitStatusSummary.js'
import {
  buildSideQuestionFallbackContextBundle,
  fetchEffectiveSystemPromptContext,
  fetchSystemPromptParts,
} from '../src/utils/queryContext.js'
import { getSystemContext } from '../src/context.js'
import type { Message } from '../src/types/message.js'
import type { CustomApiStorageData } from '../src/utils/customApiStorage.js'

type Sample = {
  ms: number
  ok: boolean
  exitCode: number | null
}

type CommandBenchmark = {
  label: string
  command: string[]
  samples: Sample[]
  meanMs: number
  medianMs: number
  minMs: number
  maxMs: number
}

type MicroBenchmark = {
  label: string
  iterations: number
  ms: number
}

type SizeBenchmark = {
  label: string
  beforeChars: number
  afterChars: number
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  if (ordered.length % 2 === 0) {
    return (ordered[middle - 1]! + ordered[middle]!) / 2
  }
  return ordered[middle]!
}

function countLines(path: string): number {
  return readFileSync(path, 'utf8').split(/\r?\n/).length
}

function runCommandBenchmark(
  cwd: string,
  label: string,
  command: string[],
  iterations = 5,
): CommandBenchmark {
  const samples: Sample[] = []
  const bunExecutable = Bun.which('bun') ?? process.argv0
  for (let i = 0; i < iterations; i++) {
    const started = nowMs()
    const result = spawnSync(bunExecutable, command, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: join(cwd, '.workbench', 'bench-home'),
      },
    })
    samples.push({
      ms: round(nowMs() - started),
      ok: result.status === 0 && !result.error,
      exitCode: result.status,
    })
  }

  const values = samples.map(sample => sample.ms)
  return {
    label,
    command,
    samples,
    meanMs: round(mean(values)),
    medianMs: round(median(values)),
    minMs: round(Math.min(...values)),
    maxMs: round(Math.max(...values)),
  }
}

function runMicroBenchmark(
  label: string,
  iterations: number,
  fn: () => void,
): MicroBenchmark {
  const started = nowMs()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  return {
    label,
    iterations,
    ms: round(nowMs() - started),
  }
}

async function runAsyncMicroBenchmark(
  label: string,
  iterations: number,
  fn: () => Promise<void>,
): Promise<MicroBenchmark> {
  const started = nowMs()
  for (let i = 0; i < iterations; i++) {
    await fn()
  }
  return {
    label,
    iterations,
    ms: round(nowMs() - started),
  }
}

function legacyFindCustomModelPreset(id: string) {
  const normalized = id.trim().toLowerCase()
  return getCustomModelPresets().find(
    preset =>
      preset.id.toLowerCase() === normalized ||
      preset.model.toLowerCase() === normalized,
  )
}

function legacyRenderCustomModelPresetList(): string {
  return getCustomModelPresets()
    .map(
      preset =>
        `- ${preset.id}: ${preset.model} (${preset.provider}) - ${preset.recommendedFor}`,
    )
    .join('\n')
}

function legacyResolveCompatibleStorage(
  raw: CustomApiStorageData,
  fallback?: CustomApiStorageData,
): CustomApiStorageData {
  const provider = raw.provider ?? fallback?.provider
  const baseURL = raw.baseURL ?? fallback?.baseURL
  const model = raw.model ?? fallback?.model
  const apiKey = raw.apiKey ?? fallback?.apiKey
  const savedModels = [
    ...new Set([
      ...(fallback?.savedModels ?? []),
      ...(raw.savedModels ?? []),
      ...(model ? [model] : []),
    ]),
  ]
  const savedProfiles = [...(fallback?.savedProfiles ?? []), ...(raw.savedProfiles ?? [])]

  if (!provider || !baseURL || !model) {
    return {
      ...raw,
      provider,
      baseURL,
      apiKey,
      model,
      savedModels,
      savedProfiles,
    }
  }

  const activeProfile = savedProfiles.find(
    profile =>
      profile.provider === provider &&
      profile.baseURL === baseURL &&
      profile.model === model,
  )

  if (activeProfile) {
    return {
      ...raw,
      provider,
      baseURL,
      apiKey: apiKey ?? activeProfile.apiKey,
      model,
      savedModels,
      savedProfiles,
    }
  }

  const matchedPreset = getCustomModelPresets().find(
    preset =>
      preset.provider === provider &&
      preset.baseURL === baseURL &&
      preset.model === model,
  )

  return {
    ...raw,
    provider,
    baseURL,
    apiKey,
    model,
    savedModels,
    savedProfiles: [
      ...savedProfiles,
      {
        id: matchedPreset?.id ?? model,
        provider,
        baseURL,
        apiKey,
        model,
      },
    ],
  }
}

function buildSummary(report: {
  generatedAt: string
  commandBenchmarks: CommandBenchmark[]
  microBenchmarks: MicroBenchmark[]
  sizeBenchmarks: SizeBenchmark[]
  fileStats: Array<{ path: string; lines: number; bytes: number }>
}): string {
  const commandLines = report.commandBenchmarks.map(
    benchmark =>
      `- ${benchmark.label}: median ${benchmark.medianMs}ms, mean ${benchmark.meanMs}ms, range ${benchmark.minMs}-${benchmark.maxMs}ms`,
  )

  const microMap = new Map(report.microBenchmarks.map(item => [item.label, item]))
  const presetLookupLegacy = microMap.get('preset_lookup_legacy')
  const presetLookupCurrent = microMap.get('preset_lookup_current')
  const renderLegacy = microMap.get('preset_render_legacy')
  const renderCurrent = microMap.get('preset_render_current')
  const resolveLegacy = microMap.get('resolve_storage_legacy')
  const resolveCurrent = microMap.get('resolve_storage_current')
  const systemPromptWarm = microMap.get('system_prompt_warm_current')
  const systemPromptWarmForcedPrefetch = microMap.get(
    'system_prompt_warm_forced_prefetch',
  )
  const customAgentContextCurrent = microMap.get(
    'custom_agent_context_current',
  )
  const customAgentContextLegacy = microMap.get('custom_agent_context_legacy')
  const compactCustomPromptCurrent = microMap.get(
    'compact_custom_prompt_current',
  )
  const compactCustomPromptLegacy = microMap.get('compact_custom_prompt_legacy')
  const auxiliaryClaudeMdSummary = microMap.get('auxiliary_claudemd_summary')
  const auxiliaryGitStatusSummary = microMap.get('auxiliary_git_status_summary')
  const manualSessionMemoryCurrent = microMap.get(
    'manual_session_memory_prep_current',
  )
  const manualSessionMemoryLegacy = microMap.get(
    'manual_session_memory_prep_legacy',
  )
  const sideQuestionFallbackCurrent = microMap.get(
    'side_question_fallback_prep_current',
  )
  const sideQuestionFallbackLegacy = microMap.get(
    'side_question_fallback_prep_legacy',
  )
  const agentSummaryLocalDerivation = microMap.get(
    'agent_summary_local_derivation',
  )
  const extractMemoriesContextWindow = microMap.get(
    'extract_memories_context_window',
  )
  const toolUseSummaryLocalDerivation = microMap.get(
    'tool_use_summary_local_derivation',
  )
  const sizeLines = report.sizeBenchmarks.map(benchmark => {
    const reduction =
      benchmark.beforeChars === 0
        ? 0
        : round(
            ((benchmark.beforeChars - benchmark.afterChars) /
              benchmark.beforeChars) *
              100,
          )
    return `- ${benchmark.label}: ${benchmark.beforeChars} chars -> ${benchmark.afterChars} chars (${reduction}% smaller)`
  })

  const speedups: string[] = []
  if (presetLookupLegacy && presetLookupCurrent) {
    speedups.push(
      `- preset lookup: ${round(presetLookupLegacy.ms / presetLookupCurrent.ms)}x faster than the legacy linear scan`,
    )
  }
  if (renderLegacy && renderCurrent) {
    speedups.push(
      `- preset list rendering: ${round(renderLegacy.ms / renderCurrent.ms)}x faster than rebuilding the list each time`,
    )
  }
  if (resolveLegacy && resolveCurrent) {
    speedups.push(
      `- compatible storage resolve: ${round(resolveLegacy.ms / resolveCurrent.ms)}x versus the legacy inline implementation`,
    )
  }
  if (systemPromptWarm && systemPromptWarmForcedPrefetch) {
    speedups.push(
      `- system prompt warm path: ${round(systemPromptWarmForcedPrefetch.ms / systemPromptWarm.ms)}x faster than forcing the old eager dependency prefetch`,
    )
  }
  if (customAgentContextCurrent && customAgentContextLegacy) {
    speedups.push(
      `- custom-agent context assembly: ${round(customAgentContextLegacy.ms / customAgentContextCurrent.ms)}x faster than eagerly building the default prompt path`,
    )
  }
  if (compactCustomPromptCurrent && compactCustomPromptLegacy) {
    speedups.push(
      `- compact custom-prompt context assembly: ${round(compactCustomPromptLegacy.ms / compactCustomPromptCurrent.ms)}x faster than rebuilding the unused default prompt path`,
    )
  }
  if (auxiliaryClaudeMdSummary) {
    speedups.push(
      `- auxiliary CLAUDE.md summarization: ${auxiliaryClaudeMdSummary.ms}ms for ${auxiliaryClaudeMdSummary.iterations} iterations`,
    )
  }
  if (auxiliaryGitStatusSummary) {
    speedups.push(
      `- auxiliary git-status summarization: ${auxiliaryGitStatusSummary.ms}ms for ${auxiliaryGitStatusSummary.iterations} iterations`,
    )
  }
  if (manualSessionMemoryCurrent && manualSessionMemoryLegacy) {
    speedups.push(
      `- manual session-memory prep: ${round(manualSessionMemoryLegacy.ms / manualSessionMemoryCurrent.ms)}x faster than rebuilding the default system prompt path`,
    )
  }
  if (sideQuestionFallbackCurrent && sideQuestionFallbackLegacy) {
    speedups.push(
      `- side-question fallback prep: ${round(sideQuestionFallbackLegacy.ms / sideQuestionFallbackCurrent.ms)}x faster than rebuilding the default system prompt path`,
    )
  }
  if (agentSummaryLocalDerivation) {
    speedups.push(
      `- agent-summary local derivation: ${agentSummaryLocalDerivation.ms}ms for ${agentSummaryLocalDerivation.iterations} iterations`,
    )
  }
  if (extractMemoriesContextWindow) {
    speedups.push(
      `- extract-memories context slicing: ${extractMemoriesContextWindow.ms}ms for ${extractMemoriesContextWindow.iterations} iterations`,
    )
  }
  if (toolUseSummaryLocalDerivation) {
    speedups.push(
      `- tool-use summary local derivation: ${toolUseSummaryLocalDerivation.ms}ms for ${toolUseSummaryLocalDerivation.iterations} iterations`,
    )
  }

  const fileLines = report.fileStats.map(
    stat => `- ${stat.path}: ${stat.lines} lines, ${stat.bytes} bytes`,
  )

  return [
    `# Benchmark Snapshot`,
    ``,
    `Generated: ${report.generatedAt}`,
    ``,
    `## CLI`,
    ...commandLines,
    ``,
    `## Model Config Microbench`,
    ...speedups,
    ``,
    `## Context Size`,
    ...(sizeLines.length > 0 ? sizeLines : ['- no CLAUDE.md context detected']),
    ``,
    `## Hot Files`,
    ...fileLines,
    ``,
  ].join('\n')
}

const cwd = process.cwd()
const outputDir = join(cwd, 'tasks', 'benchmarks')
mkdirSync(outputDir, { recursive: true })
ensureBootstrapMacro()
enableConfigs()

const presetQueries = [
  ...getCustomModelPresets().map(preset => preset.id),
  ...getCustomModelPresets().map(preset => preset.model),
  'deepseek-chat',
  'deepseek-reasoner',
  'non-existent-model',
]

let presetIndex = 0
const nextPresetQuery = () => {
  const value = presetQueries[presetIndex % presetQueries.length]!
  presetIndex++
  return value
}

const sampleStorage: CustomApiStorageData = {
  provider: 'openai',
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-current',
  model: 'deepseek-chat',
  savedModels: ['deepseek-chat', 'deepseek-reasoner', 'kimi-k2.5'],
  savedProfiles: [
    {
      id: 'deepseek-chat',
      provider: 'openai',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-deepseek',
      model: 'deepseek-chat',
    },
    {
      id: 'deepseek-reasoner',
      provider: 'openai',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-deepseek',
      model: 'deepseek-reasoner',
    },
    {
      id: 'moonshot-kimi-k2.5',
      provider: 'openai',
      baseURL: 'https://api.moonshot.cn',
      apiKey: 'sk-moonshot',
      model: 'kimi-k2.5',
    },
  ],
}

const generatedAt = new Date().toISOString().replace(/[:.]/g, '-')

clearSystemPromptSections()
await getSystemPrompt([], 'deepseek-chat')
const benchmarkCwd = process.cwd()
const benchmarkCustomAgent = {
  agentType: 'benchmark-agent',
  whenToUse: 'Benchmark custom agent path',
  source: 'userSettings' as const,
  getSystemPrompt: () => 'Benchmark custom agent prompt',
}
const benchmarkToolUseContext = {
  options: {
    tools: [],
  },
}
const benchmarkBaseUserContext = await getUserContext()
const syntheticClaudeMdFixture = [
  'Codebase and user instructions are shown below.',
  '',
  'Contents of /repo/AGENTS.md:',
  '',
  '# Build',
  '- Always use bun',
  '- Keep tests close to changed files',
  '- Avoid unrelated refactors in restoration work',
  'Narrative detail for the primary coding loop. '.repeat(40),
  '',
  'Contents of /repo/.claude/CLAUDE.md:',
  '',
  '# Coding Style',
  '- Prefer focused modules',
  '- Match surrounding file style',
  '- Verify affected flows manually',
  'Long-form rationale for coding standards. '.repeat(40),
  '',
  'Contents of /repo/.claude/rules/review.md:',
  '',
  '# Review',
  '- Important: list bugs and regressions before summary',
  '- Never hide uncertainty',
  '- Prefer concrete file references',
  'Extended review guidance and examples. '.repeat(40),
].join('\n')
const benchmarkClaudeMd =
  benchmarkBaseUserContext.claudeMd ?? syntheticClaudeMdFixture
const benchmarkUserContext = buildAuxiliaryUserContext(
  benchmarkBaseUserContext.claudeMd
    ? benchmarkBaseUserContext
    : {
        ...benchmarkBaseUserContext,
        claudeMd: syntheticClaudeMdFixture,
      },
  {
    maxClaudeMdChars: 3200,
    claudeMdSectionChars: 480,
  },
)
const benchmarkClaudeMdSummary = summarizeClaudeMdForAuxiliaryTask(
  benchmarkClaudeMd,
  {
    maxChars: 3200,
    sectionMaxChars: 480,
  },
)
const syntheticGitStatusFixture = [
  'This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.',
  'Current branch: feature/context-optimization',
  'Main branch (you will usually use this for PRs): main',
  'Git user: doge',
  `Status:\n${Array.from({ length: 30 }, (_, index) => `M src/context/file-${index}.ts`).join('\n')}`,
  `Recent commits:\n${Array.from({ length: 8 }, (_, index) => `${index}abcd optimize context path ${index}`).join('\n')}`,
].join('\n\n')
const benchmarkGitStatusSummary = summarizeGitStatusForAuxiliaryTask(
  syntheticGitStatusFixture,
  {
    maxChars: 700,
    maxStatusLines: 8,
    maxCommitLines: 2,
  },
)
const benchmarkSideQuestionFallbackBundle =
  buildSideQuestionFallbackContextBundle({
    userContext: {
      ...benchmarkBaseUserContext,
      claudeMd: syntheticClaudeMdFixture,
    },
    systemContext: {
      gitStatus: syntheticGitStatusFixture,
    },
    customSystemPrompt: undefined,
    appendSystemPrompt: undefined,
  })
const syntheticAgentSummaryTranscript: Message[] = Array.from(
  { length: 6 },
  (_, index) => {
    const turn = index + 1
    return [
      {
        type: 'user',
        uuid: `agent-user-${turn}`,
        message: {
          content: `Continue implementation step ${turn}`,
        },
      },
      {
        type: 'assistant',
        uuid: `agent-assistant-${turn}`,
        message: {
          id: `agent-turn-${turn}`,
          content: [
            {
              type: 'tool_use',
              id: `agent-tool-${turn}`,
              name: turn % 2 === 0 ? 'Edit' : 'Read',
              input: {
                file_path: `src/feature/file-${turn}.ts`,
              },
            },
          ],
        },
      },
    ] satisfies Message[]
  },
).flat()
const benchmarkAgentSummaryContext = buildAgentSummaryContextMessages(
  syntheticAgentSummaryTranscript,
)
const benchmarkAgentSummaryFullChars = JSON.stringify(
  syntheticAgentSummaryTranscript,
).length
const benchmarkAgentSummaryReducedChars = JSON.stringify(
  benchmarkAgentSummaryContext,
).length
const syntheticExtractMemoriesTranscript: Message[] = Array.from(
  { length: 10 },
  (_, index) => {
    const turn = index + 1
    return [
      {
        type: 'user',
        uuid: `memory-user-${turn}`,
        message: {
          content: `Conversation turn ${turn}`,
        },
      },
      {
        type: 'assistant',
        uuid: `memory-assistant-${turn}`,
        message: {
          id: `memory-turn-${turn}`,
          content: [
            {
              type: 'text',
              text: `Assistant update ${turn}`,
            },
          ],
        },
      },
    ] satisfies Message[]
  },
).flat()
const benchmarkExtractMemoriesContext = buildExtractMemoriesContextMessages(
  syntheticExtractMemoriesTranscript,
  'memory-assistant-6',
)
const benchmarkExtractMemoriesFullChars = JSON.stringify(
  syntheticExtractMemoriesTranscript,
).length
const benchmarkExtractMemoriesReducedChars = JSON.stringify(
  benchmarkExtractMemoriesContext,
).length
const syntheticToolUseBatch = [
  {
    name: 'Read',
    input: {
      file_path: 'src/services/api/openaiCompat.ts',
    },
    output: 'loaded',
  },
  {
    name: 'Edit',
    input: {
      file_path: 'src/services/toolUseSummary/toolUseSummaryGenerator.ts',
    },
    output: 'patched',
  },
  {
    name: 'Bash',
    input: {
      command: 'bun test ./src/services/toolUseSummary/toolUseSummaryGenerator.test.ts',
    },
    output: 'pass',
  },
] as const
const benchmarkToolUseSummaryLocal = buildLocalToolUseSummary(
  syntheticToolUseBatch as unknown as Parameters<typeof buildLocalToolUseSummary>[0],
)
const benchmarkToolUseSummaryPromptPayload = buildToolUseSummaryPromptPayload({
  tools: syntheticToolUseBatch as unknown as Parameters<
    typeof buildToolUseSummaryPromptPayload
  >[0]['tools'],
  lastAssistantText:
    'Inspect the tool-use summary path and verify the optimized fallback with tests.',
})
const benchmarkManualSessionMemoryPrompt = buildSessionMemorySystemPrompt()
const benchmarkLegacySessionMemoryPrompt = (
  await getSystemPrompt([], 'deepseek-chat')
).join('\n\n')

const report = {
  generatedAt,
  commandBenchmarks: [
    runCommandBenchmark(cwd, 'bun run version', ['run', 'version']),
    runCommandBenchmark(cwd, 'bun run dev --help', ['run', 'dev', '--help']),
  ],
  microBenchmarks: [
    runMicroBenchmark('preset_lookup_legacy', 250_000, () => {
      legacyFindCustomModelPreset(nextPresetQuery())
    }),
    runMicroBenchmark('preset_lookup_current', 250_000, () => {
      findCustomModelPreset(nextPresetQuery())
    }),
    runMicroBenchmark('preset_render_legacy', 20_000, () => {
      legacyRenderCustomModelPresetList()
    }),
    runMicroBenchmark('preset_render_current', 20_000, () => {
      renderCustomModelPresetList()
    }),
    runMicroBenchmark('resolve_storage_legacy', 120_000, () => {
      legacyResolveCompatibleStorage(sampleStorage, sampleStorage)
    }),
    runMicroBenchmark('resolve_storage_current', 120_000, () => {
      resolveCompatibleStorage(sampleStorage, sampleStorage)
    }),
    await runAsyncMicroBenchmark('system_prompt_warm_current', 50, async () => {
      await getSystemPrompt([], 'deepseek-chat')
    }),
    await runAsyncMicroBenchmark(
      'system_prompt_warm_forced_prefetch',
      50,
      async () => {
        await Promise.all([
          getSkillToolCommands(benchmarkCwd),
          getOutputStyleConfig(),
          computeSimpleEnvInfo('deepseek-chat'),
        ])
        await getSystemPrompt([], 'deepseek-chat')
      },
    ),
    await runAsyncMicroBenchmark('custom_agent_context_current', 100, async () => {
      clearSystemPromptSections()
      getUserContext.cache.clear?.()
      getSystemContext.cache.clear?.()
      await fetchSystemPromptParts({
        tools: [],
        mainLoopModel: 'deepseek-chat',
        additionalWorkingDirectories: [],
        mcpClients: [],
        customSystemPrompt: undefined,
        mainThreadAgentDefinition: benchmarkCustomAgent,
        toolUseContext: benchmarkToolUseContext,
      })
    }),
    await runAsyncMicroBenchmark('custom_agent_context_legacy', 100, async () => {
      clearSystemPromptSections()
      getUserContext.cache.clear?.()
      getSystemContext.cache.clear?.()
      await Promise.all([
        getSystemPrompt([], 'deepseek-chat'),
        getUserContext(),
        getSystemContext(),
      ])
    }),
    await runAsyncMicroBenchmark('compact_custom_prompt_current', 100, async () => {
      clearSystemPromptSections()
      getUserContext.cache.clear?.()
      getSystemContext.cache.clear?.()
      await fetchEffectiveSystemPromptContext({
        tools: [],
        mainLoopModel: 'deepseek-chat',
        additionalWorkingDirectories: [],
        mcpClients: [],
        customSystemPrompt: 'Custom compact prompt',
        appendSystemPrompt: 'Append compact prompt',
        toolUseContext: benchmarkToolUseContext,
      })
    }),
    await runAsyncMicroBenchmark('compact_custom_prompt_legacy', 100, async () => {
      clearSystemPromptSections()
      getUserContext.cache.clear?.()
      getSystemContext.cache.clear?.()
      const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
        getSystemPrompt([], 'deepseek-chat'),
        getUserContext(),
        getSystemContext(),
      ])
      void {
        systemPrompt: ['Custom compact prompt', 'Append compact prompt'],
        userContext,
        systemContext,
        defaultSystemPrompt,
      }
    }),
    runMicroBenchmark('auxiliary_claudemd_summary', 500, () => {
      summarizeClaudeMdForAuxiliaryTask(benchmarkClaudeMd, {
        maxChars: 3200,
        sectionMaxChars: 480,
      })
    }),
    runMicroBenchmark('auxiliary_git_status_summary', 500, () => {
      summarizeGitStatusForAuxiliaryTask(syntheticGitStatusFixture, {
        maxChars: 700,
        maxStatusLines: 8,
        maxCommitLines: 2,
      })
    }),
    await runAsyncMicroBenchmark('manual_session_memory_prep_current', 100, async () => {
      getUserContext.cache.clear?.()
      getSystemContext.cache.clear?.()
      const [rawUserContext, rawSystemContext] = await Promise.all([
        getUserContext(),
        getSystemContext(),
      ])
      void {
        systemPrompt: benchmarkManualSessionMemoryPrompt,
        userContext: buildAuxiliaryUserContext(rawUserContext, {
          maxClaudeMdChars: 2200,
          claudeMdSectionChars: 360,
        }),
        systemContext: buildAuxiliarySystemContext(rawSystemContext, {
          maxGitStatusChars: 700,
          maxGitStatusLines: 8,
          maxCommitLines: 2,
        }),
      }
    }),
    await runAsyncMicroBenchmark('manual_session_memory_prep_legacy', 100, async () => {
      clearSystemPromptSections()
      getUserContext.cache.clear?.()
      getSystemContext.cache.clear?.()
      const [rawSystemPrompt, userContext, systemContext] = await Promise.all([
        getSystemPrompt([], 'deepseek-chat'),
        getUserContext(),
        getSystemContext(),
      ])
      void {
        systemPrompt: rawSystemPrompt,
        userContext,
        systemContext,
      }
    }),
    await runAsyncMicroBenchmark(
      'side_question_fallback_prep_current',
      100,
      async () => {
        getUserContext.cache.clear?.()
        getSystemContext.cache.clear?.()
        const [rawUserContext, rawSystemContext] = await Promise.all([
          getUserContext(),
          getSystemContext(),
        ])
        void buildSideQuestionFallbackContextBundle({
          userContext: rawUserContext,
          systemContext: rawSystemContext,
          customSystemPrompt: undefined,
          appendSystemPrompt: undefined,
        })
      },
    ),
    await runAsyncMicroBenchmark(
      'side_question_fallback_prep_legacy',
      100,
      async () => {
        clearSystemPromptSections()
        getUserContext.cache.clear?.()
        getSystemContext.cache.clear?.()
        const [rawSystemPrompt, userContext, systemContext] = await Promise.all([
          getSystemPrompt([], 'deepseek-chat'),
          getUserContext(),
          getSystemContext(),
        ])
        void {
          systemPrompt: rawSystemPrompt,
          userContext,
          systemContext,
        }
      },
    ),
    runMicroBenchmark('agent_summary_local_derivation', 5_000, () => {
      buildLocalAgentSummary(
        syntheticAgentSummaryTranscript,
        'Reading file-5.ts',
      )
    }),
    runMicroBenchmark('extract_memories_context_window', 5_000, () => {
      buildExtractMemoriesContextMessages(
        syntheticExtractMemoriesTranscript,
        'memory-assistant-6',
      )
    }),
    runMicroBenchmark('tool_use_summary_local_derivation', 5_000, () => {
      buildLocalToolUseSummary(
        syntheticToolUseBatch as unknown as Parameters<
          typeof buildLocalToolUseSummary
        >[0],
      )
    }),
  ],
  sizeBenchmarks: [
    {
      label: benchmarkBaseUserContext.claudeMd
        ? 'agent creation CLAUDE.md payload (workspace)'
        : 'agent creation CLAUDE.md payload (synthetic large fixture)',
      beforeChars: benchmarkClaudeMd.length,
      afterChars:
        benchmarkUserContext.claudeMd?.length ?? benchmarkClaudeMdSummary.length,
    },
    {
      label: 'session memory git payload (synthetic large fixture)',
      beforeChars: syntheticGitStatusFixture.length,
      afterChars: benchmarkGitStatusSummary.length,
    },
    {
      label: 'manual session-memory system prompt',
      beforeChars: benchmarkLegacySessionMemoryPrompt.length,
      afterChars: benchmarkManualSessionMemoryPrompt.length,
    },
    {
      label: 'side-question fallback context bundle (synthetic large fixture)',
      beforeChars:
        benchmarkLegacySessionMemoryPrompt.length +
        syntheticClaudeMdFixture.length +
        syntheticGitStatusFixture.length,
      afterChars:
        benchmarkSideQuestionFallbackBundle.systemPrompt.join('\n\n').length +
        (benchmarkSideQuestionFallbackBundle.userContext.claudeMd?.length ?? 0) +
        (benchmarkSideQuestionFallbackBundle.userContext.currentDate?.length ??
          0) +
        (benchmarkSideQuestionFallbackBundle.systemContext.gitStatus?.length ??
          0),
    },
    {
      label: 'agent summary context window (synthetic transcript)',
      beforeChars: benchmarkAgentSummaryFullChars,
      afterChars: benchmarkAgentSummaryReducedChars,
    },
    {
      label: 'extract memories context window (synthetic transcript)',
      beforeChars: benchmarkExtractMemoriesFullChars,
      afterChars: benchmarkExtractMemoriesReducedChars,
    },
    {
      label: 'tool use summary prompt payload (synthetic batch)',
      beforeChars: benchmarkToolUseSummaryPromptPayload.length,
      afterChars: benchmarkToolUseSummaryLocal?.length ?? 0,
    },
  ],
  fileStats: [
    {
      path: 'src/components/Settings/Config.tsx',
      lines: countLines(join(cwd, 'src', 'components', 'Settings', 'Config.tsx')),
      bytes: readFileSync(
        join(cwd, 'src', 'components', 'Settings', 'Config.tsx'),
      ).length,
    },
    {
      path: 'src/utils/compatibleApiConfig.ts',
      lines: countLines(join(cwd, 'src', 'utils', 'compatibleApiConfig.ts')),
      bytes: readFileSync(
        join(cwd, 'src', 'utils', 'compatibleApiConfig.ts'),
      ).length,
    },
    {
      path: 'src/utils/customModelPresets.ts',
      lines: countLines(join(cwd, 'src', 'utils', 'customModelPresets.ts')),
      bytes: readFileSync(
        join(cwd, 'src', 'utils', 'customModelPresets.ts'),
      ).length,
    },
  ],
}

const jsonPath = join(outputDir, `baseline-${generatedAt}.json`)
const markdownPath = join(outputDir, `baseline-${generatedAt}.md`)
writeFileSync(jsonPath, JSON.stringify(report, null, 2))
writeFileSync(markdownPath, buildSummary(report))

console.log(`Wrote benchmark JSON: ${jsonPath}`)
console.log(`Wrote benchmark summary: ${markdownPath}`)
