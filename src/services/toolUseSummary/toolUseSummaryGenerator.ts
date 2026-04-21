/**
 * Tool Use Summary Generator
 *
 * Generates human-readable summaries of completed tool batches using Haiku.
 * Used by the SDK to provide high-level progress updates to clients.
 */

import { basename } from 'path'
import { E_TOOL_USE_SUMMARY_GENERATION_FAILED } from '../../constants/errorIds.js'
import { toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { queryHaiku } from '../api/claude.js'

const TOOL_USE_SUMMARY_SYSTEM_PROMPT = `Write a short summary label describing what these tool calls accomplished. It appears as a single-line row in a mobile app and truncates around 30 characters, so think git-commit-subject, not sentence.

Keep the verb in past tense and the most distinctive noun. Drop articles, connectors, and long location context first.

Examples:
- Searched in auth/
- Fixed NPE in UserService
- Created signup endpoint
- Read config.json
- Ran failing tests`

const MAX_SUMMARY_INTENT_CHARS = 120
const MAX_SUMMARY_PROMPT_CHARS = 700
const MIN_FIELD_CHARS = 48
const MAX_FIELD_CHARS = 180

export type ToolInfo = {
  name: string
  input: unknown
  output: unknown
}

export type GenerateToolUseSummaryParams = {
  tools: ToolInfo[]
  signal: AbortSignal
  isNonInteractiveSession: boolean
  lastAssistantText?: string
}

type DerivedLabel = {
  label: string
  category:
    | 'file'
    | 'test'
    | 'build'
    | 'lint'
    | 'search'
    | 'git'
    | 'command'
  target?: string
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateTarget(value: string, maxLength = 24): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3)}...`
}

function formatTarget(value: string): string {
  const trimmed = normalizeLabel(value)
  return truncateTarget(basename(trimmed))
}

function buildCommandLabel(command: string): DerivedLabel {
  const normalized = normalizeLabel(command)
  const lower = normalized.toLowerCase()

  if (
    /\b(bun test|npm test|pnpm test|yarn test|vitest|jest|pytest|cargo test|go test)\b/.test(
      lower,
    )
  ) {
    return { label: 'Ran tests', category: 'test' }
  }
  if (
    /\b(bun run build|npm run build|pnpm build|yarn build|tsc|webpack|vite build|cargo build|dotnet build)\b/.test(
      lower,
    )
  ) {
    return { label: 'Built project', category: 'build' }
  }
  if (/\b(lint|eslint|biome|ruff|stylelint)\b/.test(lower)) {
    return { label: 'Linted code', category: 'lint' }
  }
  if (/\bgit status\b/.test(lower)) {
    return { label: 'Checked git status', category: 'git' }
  }
  if (/\bgit diff\b/.test(lower)) {
    return { label: 'Reviewed git diff', category: 'git' }
  }
  if (/\b(rg|grep|findstr|select-string)\b/.test(lower)) {
    return { label: 'Searched codebase', category: 'search' }
  }

  return { label: 'Ran command', category: 'command' }
}

function deriveToolLabel(tool: ToolInfo): DerivedLabel | null {
  const toolName = normalizeLabel(tool.name)
  const lowerToolName = toolName.toLowerCase()
  const input =
    typeof tool.input === 'object' && tool.input !== null
      ? (tool.input as Record<string, unknown>)
      : undefined

  const filePath =
    typeof input?.file_path === 'string'
      ? formatTarget(input.file_path)
      : typeof input?.path === 'string'
        ? formatTarget(input.path)
        : undefined
  const pattern =
    typeof input?.pattern === 'string'
      ? truncateTarget(normalizeLabel(input.pattern))
      : typeof input?.query === 'string'
        ? truncateTarget(normalizeLabel(input.query))
        : undefined
  const command =
    typeof input?.command === 'string'
      ? input.command
      : typeof input?.prompt === 'string'
        ? input.prompt
        : undefined

  if (/read/i.test(lowerToolName) && filePath) {
    return {
      label: `Read ${filePath}`,
      category: 'file',
      target: filePath,
    }
  }
  if (/edit|replace|patch/i.test(lowerToolName) && filePath) {
    return {
      label: `Edited ${filePath}`,
      category: 'file',
      target: filePath,
    }
  }
  if (/write|create/i.test(lowerToolName) && filePath) {
    return {
      label: `Created ${filePath}`,
      category: 'file',
      target: filePath,
    }
  }
  if (/(grep|glob|search)/i.test(lowerToolName)) {
    return {
      label: pattern ? `Searched ${pattern}` : 'Searched codebase',
      category: 'search',
      target: pattern,
    }
  }
  if (/(bash|repl|shell)/i.test(lowerToolName) && command) {
    return buildCommandLabel(command)
  }

  return null
}

export function buildLocalToolUseSummary(tools: ToolInfo[]): string | null {
  const labels = tools
    .map(deriveToolLabel)
    .filter((label): label is DerivedLabel => label !== null)

  if (labels.length === 0) {
    return null
  }

  if (labels.length === 1) {
    return labels[0]!.label
  }

  const uniqueLabels = [...new Set(labels.map(label => label.label))]
  if (uniqueLabels.length === 1) {
    return uniqueLabels[0]!
  }

  const fileTargets = [
    ...new Set(
      labels
        .filter(label => label.category === 'file' && label.target)
        .map(label => label.target!),
    ),
  ]
  if (fileTargets.length >= 2 && labels.every(label => label.category === 'file')) {
    return `Updated ${fileTargets.length} files`
  }

  const priorityOrder: DerivedLabel['category'][] = [
    'test',
    'build',
    'lint',
    'search',
    'git',
    'file',
    'command',
  ]
  for (const category of priorityOrder) {
    const match = labels.findLast(label => label.category === category)
    if (match) {
      return match.label
    }
  }

  return labels.at(-1)?.label ?? null
}

export function buildToolUseSummaryPromptPayload({
  tools,
  lastAssistantText,
}: {
  tools: ToolInfo[]
  lastAssistantText?: string
}): string {
  const contextPrefix = lastAssistantText
    ? `User's intent (from assistant's last message): ${lastAssistantText.slice(0, MAX_SUMMARY_INTENT_CHARS)}\n\n`
    : ''
  const header = `${contextPrefix}Tools completed:\n\n`
  const footer = `\n\nLabel:`
  const perFieldBudget = getPerFieldBudget(tools, header.length, footer.length)

  const toolSummaries = tools
    .map(tool => buildPromptToolSummary(tool, perFieldBudget))
    .join('\n\n')

  return `${header}${toolSummaries}${footer}`
}

/**
 * Generates a human-readable summary of completed tools.
 *
 * @param params - Parameters including tools executed and their results
 * @returns A brief summary string, or null if generation fails
 */
export async function generateToolUseSummary({
  tools,
  signal,
  isNonInteractiveSession,
  lastAssistantText,
}: GenerateToolUseSummaryParams): Promise<string | null> {
  if (tools.length === 0) {
    return null
  }

  try {
    const localSummary = buildLocalToolUseSummary(tools)
    if (localSummary) {
      return localSummary
    }

    const response = await queryHaiku({
      systemPrompt: asSystemPrompt([TOOL_USE_SUMMARY_SYSTEM_PROMPT]),
      userPrompt: buildToolUseSummaryPromptPayload({
        tools,
        lastAssistantText,
      }),
      signal,
      options: {
        querySource: 'tool_use_summary_generation',
        enablePromptCaching: true,
        agents: [],
        isNonInteractiveSession,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const summary = response.message.content
      .filter(block => block.type === 'text')
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()

    return summary || null
  } catch (error) {
    // Log but don't fail - summaries are non-critical
    const err = toError(error)
    err.cause = { errorId: E_TOOL_USE_SUMMARY_GENERATION_FAILED }
    logError(err)
    return null
  }
}

/**
 * Truncates a JSON value to a maximum length for the prompt.
 */
function truncateJson(value: unknown, maxLength: number): string {
  try {
    const str = jsonStringify(value)
    if (str.length <= maxLength) {
      return str
    }
    return str.slice(0, maxLength - 3) + '...'
  } catch {
    return '[unable to serialize]'
  }
}

function buildPromptToolSummary(
  tool: ToolInfo,
  perFieldBudget: number,
): string {
  const header = `Tool: ${tool.name}`
  const outputMissing =
    tool.output === null || tool.output === undefined || tool.output === ''
  const inputStr = truncateJson(tool.input, perFieldBudget)
  if (outputMissing) {
    return `${header}\nInput: ${inputStr}`
  }

  const outputStr = truncateJson(tool.output, perFieldBudget)
  return `${header}\nInput: ${inputStr}\nOutput: ${outputStr}`
}

function getPerFieldBudget(
  tools: ToolInfo[],
  headerLength: number,
  footerLength: number,
): number {
  if (tools.length === 0) {
    return MAX_FIELD_CHARS
  }

  const fieldsPerTool = tools.map(tool =>
    tool.output === null || tool.output === undefined || tool.output === ''
      ? 1
      : 2,
  )
  const toolShellChars = tools.reduce((sum, tool, index) => {
    const fields = fieldsPerTool[index]!
    return (
      sum +
      `Tool: ${tool.name}\nInput: `.length +
      (fields === 2 ? `\nOutput: `.length : 0)
    )
  }, 0)
  const separatorChars = Math.max(0, tools.length - 1) * '\n\n'.length
  const totalFields = fieldsPerTool.reduce((sum, count) => sum + count, 0)
  const availableFieldChars =
    MAX_SUMMARY_PROMPT_CHARS -
    headerLength -
    footerLength -
    toolShellChars -
    separatorChars

  return Math.max(
    12,
    Math.min(MAX_FIELD_CHARS, Math.floor(availableFieldChars / totalFields)),
  )
}
