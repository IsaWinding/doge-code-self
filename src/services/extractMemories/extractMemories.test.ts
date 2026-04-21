import { describe, expect, test } from 'bun:test'
import { buildExtractMemoriesContextMessages } from './extractMemories.js'
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
      content: [{ type: 'text', text }],
    },
  }
}

describe('buildExtractMemoriesContextMessages', () => {
  test('returns the full transcript when there is no cursor yet', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'Initial request'),
      createAssistantMessage('a1', 'turn-1', 'Working on it'),
    ]

    expect(buildExtractMemoriesContextMessages(messages, undefined)).toEqual(
      messages,
    )
  })

  test('returns only messages after the cursor uuid', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'First'),
      createAssistantMessage('a1', 'turn-1', 'Done first'),
      createUserMessage('u2', 'Second'),
      createAssistantMessage('a2', 'turn-2', 'Done second'),
    ]

    expect(buildExtractMemoriesContextMessages(messages, 'a1')).toEqual([
      messages[2]!,
      messages[3]!,
    ])
  })

  test('prepends a meta user marker when the sliced context starts with assistant', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'First'),
      createAssistantMessage('a1', 'turn-1', 'Done first'),
      createAssistantMessage('a2', 'turn-2', 'Autonomous follow-up'),
    ]

    const result = buildExtractMemoriesContextMessages(messages, 'a1')

    expect(result[0]?.type).toBe('user')
    expect(result[0]?.isMeta).toBe(true)
    expect(result[1]?.uuid).toBe('a2')
  })

  test('falls back to full transcript if the cursor uuid is missing', () => {
    const messages: Message[] = [
      createUserMessage('u1', 'First'),
      createAssistantMessage('a1', 'turn-1', 'Done first'),
    ]

    expect(
      buildExtractMemoriesContextMessages(messages, 'missing-uuid'),
    ).toEqual(messages)
  })
})
