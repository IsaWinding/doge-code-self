import { describe, expect, test } from 'bun:test'
import { buildSessionMemorySystemPrompt } from './prompts.js'

describe('buildSessionMemorySystemPrompt', () => {
  test('keeps the prompt focused on edit-only session note maintenance', () => {
    const prompt = buildSessionMemorySystemPrompt()

    expect(prompt).toContain('session-memory maintenance agent')
    expect(prompt).toContain('allowed Edit tool')
    expect(prompt).toContain('Do not browse, investigate, or perform unrelated work')
  })
})
