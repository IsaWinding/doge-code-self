import { describe, expect, test } from 'bun:test'
import {
  buildSessionMemoryContextMessages,
} from './sessionMemory.js'
import type { Message } from '../../types/message.js'

function createUserMessage(uuid: string, content: string): Message {
  return {
    type: 'user',
    uuid,
    message: { content },
  }
}

function createAssistantMessage(uuid: string, id: string, text: string): Message {
  return {
    type: 'assistant',
    uuid,
    message: {
      id,
      content: [
        {
          type: 'text',
          text,
        },
      ],
    },
  }
}

describe('buildSessionMemoryContextMessages', () => {
  test('returns full transcript when no cursor is available', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'start'),
      createAssistantMessage('a1', 'turn-1', 'reply'),
    ]

    expect(buildSessionMemoryContextMessages(messages, undefined)).toEqual(messages)
  })

  test('returns only messages after the last summarized id', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'start'),
      createAssistantMessage('a1', 'turn-1', 'reply'),
      createUserMessage('u2', 'new request'),
      createAssistantMessage('a2', 'turn-2', 'new reply'),
    ]

    expect(buildSessionMemoryContextMessages(messages, 'a1')).toEqual([
      messages[2]!,
      messages[3]!,
    ])
  })

  test('prepends a meta marker when the sliced context starts with assistant', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'start'),
      createAssistantMessage('a1', 'turn-1', 'reply'),
      createAssistantMessage('a2', 'turn-2', 'follow-up'),
    ]

    const result = buildSessionMemoryContextMessages(messages, 'u1')

    expect(result[0]?.type).toBe('user')
    expect(result[0]?.isMeta).toBe(true)
    expect(result).toHaveLength(3)
    expect(result.at(-1)?.uuid).toBe('a2')
  })

  test('returns empty array when there are no new messages', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'start'),
      createAssistantMessage('a1', 'turn-1', 'reply'),
    ]

    expect(buildSessionMemoryContextMessages(messages, 'a1')).toEqual([])
  })

  test('falls back to full transcript when cursor is missing', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'start'),
      createAssistantMessage('a1', 'turn-1', 'reply'),
    ]

    expect(buildSessionMemoryContextMessages(messages, 'missing')).toEqual(messages)
  })
})
