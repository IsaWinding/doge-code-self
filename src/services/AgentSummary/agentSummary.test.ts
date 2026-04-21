import { describe, expect, test } from 'bun:test'
import {
  buildAgentSummaryContextMessages,
  buildLocalAgentSummary,
} from './agentSummary.js'
import type { Message } from '../../types/message.js'

function createUserMessage(
  uuid: string,
  content: string,
): Message {
  return {
    type: 'user',
    uuid,
    message: { content },
  }
}

function createAssistantToolUseMessage(
  uuid: string,
  id: string,
  toolName: string,
  input: Record<string, unknown>,
): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id,
      content: [
        {
          type: 'tool_use',
          id: `${uuid}-tool`,
          name: toolName,
          input,
        },
      ],
    },
  }
}

describe('buildLocalAgentSummary', () => {
  test('derives a concise summary from a recent file edit', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'Please fix the null check.'),
      createAssistantToolUseMessage('a1', 'turn-1', 'Edit', {
        file_path: 'src/utils/validate.ts',
      }),
    ]

    expect(buildLocalAgentSummary(messages, null)).toBe(
      'Editing validate.ts',
    )
  })

  test('derives a concise summary from a recent test command', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'Run the tests.'),
      createAssistantToolUseMessage('a1', 'turn-1', 'Bash', {
        command: 'bun test ./src/utils/queryContext.test.ts',
      }),
    ]

    expect(buildLocalAgentSummary(messages, null)).toBe('Running tests')
  })

  test('returns null when the derived summary would repeat the previous one', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'Read the file.'),
      createAssistantToolUseMessage('a1', 'turn-1', 'Read', {
        file_path: 'src/services/AgentSummary/agentSummary.ts',
      }),
    ]

    expect(buildLocalAgentSummary(messages, 'Reading agentSummary.ts')).toBeNull()
  })
})

describe('buildAgentSummaryContextMessages', () => {
  test('keeps only the most recent api rounds and prepends a user marker when needed', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'Start task'),
      createAssistantToolUseMessage('a1', 'turn-1', 'Read', {
        file_path: 'src/one.ts',
      }),
      createUserMessage('u2', 'Continue'),
      createAssistantToolUseMessage('a2', 'turn-2', 'Edit', {
        file_path: 'src/two.ts',
      }),
      createUserMessage('u3', 'Keep going'),
      createAssistantToolUseMessage('a3', 'turn-3', 'Bash', {
        command: 'bun test',
      }),
      createUserMessage('u4', 'Almost there'),
      createAssistantToolUseMessage('a4', 'turn-4', 'Write', {
        file_path: 'src/three.ts',
      }),
      createUserMessage('u5', 'Finish up'),
      createAssistantToolUseMessage('a5', 'turn-5', 'Grep', {
        pattern: 'TODO',
      }),
    ]

    const result = buildAgentSummaryContextMessages(messages)

    expect(result[0]?.type).toBe('user')
    expect(result[0]?.isMeta).toBe(true)
    expect(result).toHaveLength(8)
    expect(result.at(-1)?.uuid).toBe('a5')
    expect(result.some(message => message.uuid === 'u1')).toBe(false)
    expect(result.some(message => message.uuid === 'a1')).toBe(false)
  })
})
