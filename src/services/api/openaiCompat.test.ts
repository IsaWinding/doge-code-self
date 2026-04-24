import { describe, expect, test } from 'bun:test'
import {
  convertAnthropicRequestToOpenAI,
  createAnthropicStreamFromOpenAI,
} from './openaiCompat.js'

function createReaderFromChunks(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return stream.getReader()
}

describe('convertAnthropicRequestToOpenAI', () => {
  test('preserves assistant thinking blocks as reasoning_content', () => {
    const request = convertAnthropicRequestToOpenAI({
      model: 'claude-test',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'thinking',
              thinking: 'Need to inspect the code path first.',
              signature: 'sig',
            },
            {
              type: 'text',
              text: 'I found the issue.',
            },
          ],
        },
      ] as any,
    })

    expect(request.messages).toEqual([
      {
        role: 'assistant',
        content: 'I found the issue.',
        reasoning_content: 'Need to inspect the code path first.',
      },
    ])
  })
})

describe('createAnthropicStreamFromOpenAI', () => {
  test('maps streamed reasoning_content into thinking events', async () => {
    const reader = createReaderFromChunks([
      'data: {"id":"resp_1","choices":[{"delta":{"reasoning_content":"step one"}}]}\n\n',
      'data: {"id":"resp_1","choices":[{"delta":{"content":"final answer"}}]}\n\n',
      'data: {"id":"resp_1","choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ])

    const events = []
    for await (const event of createAnthropicStreamFromOpenAI({
      reader,
      model: 'deepseek-v4-pro',
    })) {
      events.push(event)
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'content_block_start',
          index: 0,
          content_block: expect.objectContaining({
            type: 'thinking',
          }),
        }),
        expect.objectContaining({
          type: 'content_block_delta',
          index: 0,
          delta: expect.objectContaining({
            type: 'thinking_delta',
            thinking: 'step one',
          }),
        }),
        expect.objectContaining({
          type: 'content_block_start',
          index: 1,
          content_block: expect.objectContaining({
            type: 'text',
          }),
        }),
        expect.objectContaining({
          type: 'content_block_delta',
          index: 1,
          delta: expect.objectContaining({
            type: 'text_delta',
            text: 'final answer',
          }),
        }),
      ]),
    )
  })
})
