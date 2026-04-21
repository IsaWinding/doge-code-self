/**
 * Periodic background summarization for coordinator mode sub-agents.
 *
 * Forks the sub-agent's conversation every ~30s using runForkedAgent()
 * to generate a 1-2 sentence progress summary. The summary is stored
 * on AgentProgress for UI display.
 *
 * Cache sharing: uses the same CacheSafeParams as the parent agent
 * to share the prompt cache. Tools are kept in the request for cache
 * key matching but denied via canUseTool callback.
 */

import { basename } from 'path'
import type { TaskContext } from '../../Task.js'
import { updateAgentSummary } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { groupMessagesByApiRound } from '../../services/compact/grouping.js'
import { filterIncompleteToolCalls } from '../../tools/AgentTool/runAgent.js'
import type { AgentId } from '../../types/ids.js'
import type { Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  type CacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import { logError } from '../../utils/log.js'
import { createUserMessage } from '../../utils/messages.js'
import { getAgentTranscript } from '../../utils/sessionStorage.js'

const SUMMARY_INTERVAL_MS = 30_000
const SUMMARY_CONTEXT_MAX_API_ROUNDS = 4
const OMITTED_TRANSCRIPT_MARKER =
  "Earlier transcript omitted. Focus only on the agent's most recent action."

function buildSummaryPrompt(previousSummary: string | null): string {
  const prevLine = previousSummary
    ? `\nPrevious: "${previousSummary}" — say something NEW.\n`
    : ''

  return `Describe your most recent action in 3-5 words using present tense (-ing). Name the file or function, not the branch. Do not use tools.
${prevLine}
Good: "Reading runAgent.ts"
Good: "Fixing null check in validate.ts"
Good: "Running auth module tests"
Good: "Adding retry logic to fetchUser"

Bad (past tense): "Analyzed the branch diff"
Bad (too vague): "Investigating the issue"
Bad (too long): "Reviewing full branch diff and AgentTool.tsx integration"
Bad (branch name): "Analyzed adam/background-summary branch diff"`
}

function trimSummaryLabel(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim()
}

function truncateTarget(value: string, maxLength = 28): string {
  const trimmed = trimSummaryLabel(value)
  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, maxLength - 3)}...`
}

function buildCommandSummary(command: string): string {
  const normalized = command.trim().replace(/\s+/g, ' ')
  const lower = normalized.toLowerCase()

  if (
    /\b(bun test|npm test|pnpm test|yarn test|vitest|jest|pytest|cargo test|go test)\b/.test(
      lower,
    )
  ) {
    return 'Running tests'
  }
  if (/\b(bun run build|npm run build|pnpm build|yarn build|tsc|webpack|vite build|cargo build|dotnet build)\b/.test(lower)) {
    return 'Building project'
  }
  if (/\b(lint|eslint|biome|ruff|stylelint)\b/.test(lower)) {
    return 'Linting code'
  }
  if (/\bgit status\b/.test(lower)) {
    return 'Checking git status'
  }
  if (/\bgit diff\b/.test(lower)) {
    return 'Reviewing git diff'
  }
  if (/\b(rg|grep|findstr|select-string)\b/.test(lower)) {
    return 'Searching codebase'
  }

  return 'Running shell command'
}

function buildToolSummary(
  block: {
    name?: string
    input?: unknown
  },
): string | null {
  const toolName = block.name ?? ''
  const input =
    typeof block.input === 'object' && block.input !== null
      ? (block.input as Record<string, unknown>)
      : undefined
  const filePath =
    typeof input?.file_path === 'string'
      ? truncateTarget(basename(input.file_path))
      : null
  const pattern =
    typeof input?.pattern === 'string'
      ? truncateTarget(input.pattern, 24)
      : typeof input?.query === 'string'
        ? truncateTarget(input.query, 24)
        : null

  if (/read/i.test(toolName) && filePath) {
    return `Reading ${filePath}`
  }
  if (/edit/i.test(toolName) && filePath) {
    return `Editing ${filePath}`
  }
  if (/write/i.test(toolName) && filePath) {
    return `Writing ${filePath}`
  }
  if (/(grep|glob|search)/i.test(toolName) && pattern) {
    return `Searching ${pattern}`
  }
  if (/(bash|repl)/i.test(toolName)) {
    const command =
      typeof input?.command === 'string'
        ? input.command
        : typeof input?.prompt === 'string'
          ? input.prompt
          : null
    return command ? buildCommandSummary(command) : 'Running command'
  }
  if (/task.?output/i.test(toolName)) {
    return 'Checking task output'
  }
  if (filePath) {
    return `Updating ${filePath}`
  }

  return null
}

export function buildLocalAgentSummary(
  messages: Message[],
  previousSummary: string | null,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (
      message?.type !== 'assistant' ||
      !Array.isArray(message.message.content)
    ) {
      continue
    }

    for (let j = message.message.content.length - 1; j >= 0; j--) {
      const block = message.message.content[j]
      if (
        typeof block !== 'object' ||
        block === null ||
        !('type' in block) ||
        block.type !== 'tool_use'
      ) {
        continue
      }

      const summary = buildToolSummary(block)
      if (!summary) {
        continue
      }

      const normalized = trimSummaryLabel(summary)
      if (!normalized || normalized === previousSummary) {
        return null
      }
      return normalized
    }
  }

  return null
}

export function buildAgentSummaryContextMessages(
  messages: Message[],
): Message[] {
  const groups = groupMessagesByApiRound(messages)
  const selected = groups.slice(-SUMMARY_CONTEXT_MAX_API_ROUNDS).flat()

  if (selected.length === 0) {
    return []
  }

  if (selected[0]?.type === 'assistant') {
    return [
      createUserMessage({
        content: OMITTED_TRANSCRIPT_MARKER,
        isMeta: true,
      }),
      ...selected,
    ]
  }

  return selected
}

export function startAgentSummarization(
  taskId: string,
  agentId: AgentId,
  cacheSafeParams: CacheSafeParams,
  setAppState: TaskContext['setAppState'],
): { stop: () => void } {
  // Drop forkContextMessages from the closure — runSummary rebuilds it each
  // tick from getAgentTranscript(). Without this, the original fork messages
  // (passed from AgentTool.tsx) are pinned for the lifetime of the timer.
  const { forkContextMessages: _drop, ...baseParams } = cacheSafeParams
  let summaryAbortController: AbortController | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let previousSummary: string | null = null
  let lastSummarizedMessageUuid: string | undefined

  async function runSummary(): Promise<void> {
    if (stopped) return

    logForDebugging(`[AgentSummary] Timer fired for agent ${agentId}`)

    try {
      // Read current messages from transcript
      const transcript = await getAgentTranscript(agentId)
      if (!transcript || transcript.messages.length < 3) {
        // Not enough context yet — finally block will schedule next attempt
        logForDebugging(
          `[AgentSummary] Skipping summary for ${taskId}: not enough messages (${transcript?.messages.length ?? 0})`,
        )
        return
      }

      // Filter to clean message state
      const cleanMessages = filterIncompleteToolCalls(transcript.messages)
      const latestMessageUuid = cleanMessages.at(-1)?.uuid

      if (
        latestMessageUuid !== undefined &&
        latestMessageUuid === lastSummarizedMessageUuid
      ) {
        logForDebugging(
          `[AgentSummary] Skipping summary for ${taskId}: transcript unchanged`,
        )
        return
      }

      const localSummary = buildLocalAgentSummary(cleanMessages, previousSummary)
      if (localSummary) {
        logForDebugging(
          `[AgentSummary] Using local summary for ${taskId}: ${localSummary}`,
        )
        previousSummary = localSummary
        lastSummarizedMessageUuid = latestMessageUuid
        updateAgentSummary(taskId, localSummary, setAppState)
        return
      }

      const summaryContextMessages =
        buildAgentSummaryContextMessages(cleanMessages)

      // Build fork params with current messages
      const forkParams: CacheSafeParams = {
        ...baseParams,
        forkContextMessages: summaryContextMessages,
      }

      logForDebugging(
        `[AgentSummary] Forking for summary, ${summaryContextMessages.length} messages in context`,
      )

      // Create abort controller for this summary
      summaryAbortController = new AbortController()

      // Deny tools via callback, NOT by passing tools:[] - that busts cache
      const canUseTool = async () => ({
        behavior: 'deny' as const,
        message: 'No tools needed for summary',
        decisionReason: { type: 'other' as const, reason: 'summary only' },
      })

      // DO NOT set maxOutputTokens here. The fork piggybacks on the main
      // thread's prompt cache by sending identical cache-key params (system,
      // tools, model, messages prefix, thinking config). Setting maxOutputTokens
      // would clamp budget_tokens, creating a thinking config mismatch that
      // invalidates the cache.
      //
      // ContentReplacementState is cloned by default in createSubagentContext
      // from forkParams.toolUseContext (the subagent's LIVE state captured at
      // onCacheSafeParams time). No explicit override needed.
      const result = await runForkedAgent({
        promptMessages: [
          createUserMessage({ content: buildSummaryPrompt(previousSummary) }),
        ],
        cacheSafeParams: forkParams,
        canUseTool,
        querySource: 'agent_summary',
        forkLabel: 'agent_summary',
        overrides: { abortController: summaryAbortController },
        skipTranscript: true,
      })

      if (stopped) return

      // Extract summary text from result
      for (const msg of result.messages) {
        if (msg.type !== 'assistant') continue
        // Skip API error messages
        if (msg.isApiErrorMessage) {
          logForDebugging(
            `[AgentSummary] Skipping API error message for ${taskId}`,
          )
          continue
        }
        const textBlock = msg.message.content.find(b => b.type === 'text')
        if (textBlock?.type === 'text' && textBlock.text.trim()) {
          const summaryText = textBlock.text.trim()
          logForDebugging(
            `[AgentSummary] Summary result for ${taskId}: ${summaryText}`,
          )
          previousSummary = summaryText
          lastSummarizedMessageUuid = latestMessageUuid
          updateAgentSummary(taskId, summaryText, setAppState)
          break
        }
      }
    } catch (e) {
      if (!stopped && e instanceof Error) {
        logError(e)
      }
    } finally {
      summaryAbortController = null
      // Reset timer on completion (not initiation) to prevent overlapping summaries
      if (!stopped) {
        scheduleNext()
      }
    }
  }

  function scheduleNext(): void {
    if (stopped) return
    timeoutId = setTimeout(runSummary, SUMMARY_INTERVAL_MS)
  }

  function stop(): void {
    logForDebugging(`[AgentSummary] Stopping summarization for ${taskId}`)
    stopped = true
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (summaryAbortController) {
      summaryAbortController.abort()
      summaryAbortController = null
    }
  }

  // Start the first timer
  scheduleNext()

  return { stop }
}
