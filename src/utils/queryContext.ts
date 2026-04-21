/**
 * Shared helpers for building the API cache-key prefix (systemPrompt,
 * userContext, systemContext) for query() calls.
 *
 * Lives in its own file because it imports from context.ts and
 * constants/prompts.ts, which are high in the dependency graph. Putting
 * these imports in systemPrompt.ts or sideQuestion.ts (both reachable
 * from commands.ts) would create cycles. Only entrypoint-layer files
 * import from here (QueryEngine.ts, cli/print.ts).
 */

import type { Command } from '../commands.js'
import { getSystemPrompt } from '../constants/prompts.js'
import {
  buildAuxiliarySystemContext,
  buildAuxiliaryUserContext,
  getSystemContext,
  getUserContext,
} from '../context.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type { AppState } from '../state/AppStateStore.js'
import type { Tools, ToolUseContext } from '../Tool.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import type { Message } from '../types/message.js'
import { createAbortController } from './abortController.js'
import type { FileStateCache } from './fileStateCache.js'
import type { CacheSafeParams } from './forkedAgent.js'
import { getMainLoopModel } from './model/model.js'
import {
  buildEffectiveSystemPrompt,
  shouldBuildDefaultSystemPrompt,
} from './systemPrompt.js'
import {
  shouldEnableThinkingByDefault,
  type ThinkingConfig,
} from './thinking.js'
import { asSystemPrompt, type SystemPrompt } from './systemPromptType.js'

export type PromptContextMap = { [k: string]: string }

type SystemPromptPartsResolvers = {
  getDefaultSystemPrompt: () => Promise<string[]>
  getUserContext: () => Promise<PromptContextMap>
  getSystemContext: () => Promise<PromptContextMap>
}

export async function fetchSystemPromptPartsWithResolvers({
  customSystemPrompt,
  resolvers,
}: {
  customSystemPrompt: string | undefined
  resolvers: SystemPromptPartsResolvers
}): Promise<{
  defaultSystemPrompt: string[]
  userContext: PromptContextMap
  systemContext: PromptContextMap
}> {
  const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([
    customSystemPrompt !== undefined
      ? Promise.resolve([])
      : resolvers.getDefaultSystemPrompt(),
    resolvers.getUserContext(),
    customSystemPrompt !== undefined
      ? Promise.resolve({})
      : resolvers.getSystemContext(),
  ])

  return { defaultSystemPrompt, userContext, systemContext }
}

/**
 * Fetch the three context pieces that form the API cache-key prefix:
 * systemPrompt parts, userContext, systemContext.
 *
 * When customSystemPrompt is set, the default getSystemPrompt build and
 * getSystemContext are skipped — the custom prompt replaces the default
 * entirely, and systemContext would be appended to a default that isn't
 * being used.
 *
 * Callers assemble the final systemPrompt from defaultSystemPrompt (or
 * customSystemPrompt) + optional extras + appendSystemPrompt. QueryEngine
 * injects coordinator userContext and memory-mechanics prompt on top;
 * sideQuestion's fallback uses the base result directly.
 */
export async function fetchSystemPromptParts({
  tools,
  mainLoopModel,
  additionalWorkingDirectories,
  mcpClients,
  customSystemPrompt,
  mainThreadAgentDefinition,
  toolUseContext,
}: {
  tools: Tools
  mainLoopModel: string
  additionalWorkingDirectories: string[]
  mcpClients: MCPServerConnection[]
  customSystemPrompt: string | undefined
  mainThreadAgentDefinition?: AgentDefinition
  toolUseContext?: Pick<ToolUseContext, 'options'>
}): Promise<{
  defaultSystemPrompt: string[]
  userContext: PromptContextMap
  systemContext: PromptContextMap
}> {
  const shouldLoadDefaultSystemPrompt =
    toolUseContext !== undefined
      ? shouldBuildDefaultSystemPrompt({
          mainThreadAgentDefinition,
          toolUseContext,
          customSystemPrompt,
        })
      : customSystemPrompt === undefined

  return fetchSystemPromptPartsWithResolvers({
    customSystemPrompt,
    resolvers: {
      getDefaultSystemPrompt: () =>
        shouldLoadDefaultSystemPrompt
          ? getSystemPrompt(
              tools,
              mainLoopModel,
              additionalWorkingDirectories,
              mcpClients,
            )
          : Promise.resolve([]),
      getUserContext,
      getSystemContext,
    },
  })
}

export async function fetchEffectiveSystemPromptContext({
  tools,
  mainLoopModel,
  additionalWorkingDirectories,
  mcpClients,
  customSystemPrompt,
  appendSystemPrompt,
  mainThreadAgentDefinition,
  toolUseContext,
}: {
  tools: Tools
  mainLoopModel: string
  additionalWorkingDirectories: string[]
  mcpClients: MCPServerConnection[]
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  mainThreadAgentDefinition?: AgentDefinition
  toolUseContext?: Pick<ToolUseContext, 'options'>
}): Promise<{
  systemPrompt: SystemPrompt
  userContext: PromptContextMap
  systemContext: PromptContextMap
}> {
  const { defaultSystemPrompt, userContext, systemContext } =
    await fetchSystemPromptParts({
      tools,
      mainLoopModel,
      additionalWorkingDirectories,
      mcpClients,
      customSystemPrompt,
      mainThreadAgentDefinition,
      toolUseContext,
    })

  return assembleEffectiveSystemPromptContext({
    tools,
    customSystemPrompt,
    appendSystemPrompt,
    mainThreadAgentDefinition,
    toolUseContext,
    defaultSystemPrompt,
    userContext,
    systemContext,
  })
}

export function assembleEffectiveSystemPromptContext({
  tools,
  customSystemPrompt,
  appendSystemPrompt,
  mainThreadAgentDefinition,
  toolUseContext,
  defaultSystemPrompt,
  userContext,
  systemContext,
}: {
  tools: Tools
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  mainThreadAgentDefinition?: AgentDefinition
  toolUseContext?: Pick<ToolUseContext, 'options'>
  defaultSystemPrompt: string[]
  userContext: PromptContextMap
  systemContext: PromptContextMap
}): {
  systemPrompt: SystemPrompt
  userContext: PromptContextMap
  systemContext: PromptContextMap
} {
  const resolvedToolUseContext =
    toolUseContext ??
    ({ options: { tools } } as Pick<ToolUseContext, 'options'>)

  return {
    systemPrompt: buildEffectiveSystemPrompt({
      mainThreadAgentDefinition,
      toolUseContext: resolvedToolUseContext,
      customSystemPrompt,
      defaultSystemPrompt,
      appendSystemPrompt,
    }),
    userContext,
    systemContext,
  }
}

export function buildSideQuestionFallbackContextBundle({
  userContext,
  systemContext,
  customSystemPrompt,
  appendSystemPrompt,
}: {
  userContext: PromptContextMap
  systemContext: PromptContextMap
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
}): {
  systemPrompt: SystemPrompt
  userContext: PromptContextMap
  systemContext: PromptContextMap
} {
  return {
    systemPrompt: asSystemPrompt([
      customSystemPrompt ??
        `You are a focused coding assistant answering a side question about the current conversation.

Rules:
- Answer directly from the available conversation context
- Keep the answer concise, accurate, and action-free
- Do not assume you can use tools or inspect anything new`,
      ...(appendSystemPrompt ? [appendSystemPrompt] : []),
    ]),
    userContext: buildAuxiliaryUserContext(userContext, {
      maxClaudeMdChars: 2400,
      claudeMdSectionChars: 360,
    }),
    systemContext: buildAuxiliarySystemContext(systemContext, {
      maxGitStatusChars: 650,
      maxGitStatusLines: 8,
      maxCommitLines: 2,
    }),
  }
}

/**
 * Build CacheSafeParams from raw inputs when getLastCacheSafeParams() is null.
 *
 * Used by the SDK side_question handler (print.ts) on resume before a turn
 * completes — there's no stopHooks snapshot yet. Mirrors the system prompt
 * assembly in QueryEngine.ts:ask() so the rebuilt prefix matches what the
 * main loop will send, preserving the cache hit in the common case.
 *
 * May still miss the cache if the main loop applies extras this path doesn't
 * know about (coordinator mode, memory-mechanics prompt). That's acceptable —
 * the alternative is returning null and failing the side question entirely.
 */
export async function buildSideQuestionFallbackParams({
  tools,
  commands,
  mcpClients,
  messages,
  readFileState,
  getAppState,
  setAppState,
  customSystemPrompt,
  appendSystemPrompt,
  thinkingConfig,
  agents,
}: {
  tools: Tools
  commands: Command[]
  mcpClients: MCPServerConnection[]
  messages: Message[]
  readFileState: FileStateCache
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  thinkingConfig: ThinkingConfig | undefined
  agents: AgentDefinition[]
}): Promise<CacheSafeParams> {
  const mainLoopModel = getMainLoopModel()
  const [rawUserContext, rawSystemContext] = await Promise.all([
    getUserContext(),
    getSystemContext(),
  ])

  const { systemPrompt, userContext, systemContext } =
    buildSideQuestionFallbackContextBundle({
      userContext: rawUserContext,
      systemContext: rawSystemContext,
      customSystemPrompt,
      appendSystemPrompt,
    })

  // Strip in-progress assistant message (stop_reason === null) — same guard
  // as btw.tsx. The SDK can fire side_question mid-turn.
  const last = messages.at(-1)
  const forkContextMessages =
    last?.type === 'assistant' && last.message.stop_reason === null
      ? messages.slice(0, -1)
      : messages

  const toolUseContext: ToolUseContext = {
    options: {
      commands,
      debug: false,
      mainLoopModel,
      tools,
      verbose: false,
      thinkingConfig:
        thinkingConfig ??
        (shouldEnableThinkingByDefault() !== false
          ? { type: 'adaptive' }
          : { type: 'disabled' }),
      mcpClients,
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { activeAgents: agents, allAgents: [] },
      customSystemPrompt,
      appendSystemPrompt,
    },
    abortController: createAbortController(),
    readFileState,
    getAppState,
    setAppState,
    messages: forkContextMessages,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  }

  return {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    forkContextMessages,
  }
}
