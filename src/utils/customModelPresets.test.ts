import { describe, expect, test } from 'bun:test'
import {
  findCustomModelPreset,
  findCustomModelPresetMatches,
} from './customModelPresets.js'

describe('customModelPresets', () => {
  test('resolves exact preset ids before model aliases', () => {
    expect(findCustomModelPreset('bailian-kimi-k2.5')?.baseURL).toBe(
      'https://dashscope.aliyuncs.com/apps/anthropic',
    )
    expect(findCustomModelPreset('moonshot-kimi-k2.5')?.baseURL).toBe(
      'https://api.moonshot.cn',
    )
  })

  test('does not choose a provider when a model alias is ambiguous', () => {
    expect(findCustomModelPreset('kimi-k2.5')).toBeUndefined()
  })

  test('returns all matches for ambiguous model aliases', () => {
    expect(
      findCustomModelPresetMatches('kimi-k2.5').map(preset => preset.id),
    ).toEqual(['bailian-kimi-k2.5', 'moonshot-kimi-k2.5'])
  })

  test('keeps unique model aliases convenient', () => {
    expect(findCustomModelPreset('deepseek-v4-pro')?.id).toBe(
      'deepseek-v4-pro',
    )
  })
})
