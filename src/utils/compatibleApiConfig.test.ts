import { describe, expect, test } from 'bun:test'
import {
  buildStorageAfterProfileRemoval,
  buildStorageForApiKeyUpdate,
  buildStorageForPresetSelection,
  isActiveCompatibleTarget,
  resolveCompatibleStorage,
} from './compatibleApiConfig.js'
import type { CustomApiStorageData } from './customApiStorage.js'

const baseStorage: CustomApiStorageData = {
  provider: 'openai',
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-deepseek',
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

describe('compatibleApiConfig', () => {
  test('preset selection does not leak another provider key', () => {
    const storageWithoutMoonshotKey: CustomApiStorageData = {
      ...baseStorage,
      apiKey: 'sk-deepseek',
      provider: 'openai',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      savedProfiles: [baseStorage.savedProfiles![0]!, baseStorage.savedProfiles![1]!],
    }

    const next = buildStorageForPresetSelection(storageWithoutMoonshotKey, {
      id: 'moonshot-kimi-k2.5',
      provider: 'openai',
      baseURL: 'https://api.moonshot.cn',
      model: 'kimi-k2.5',
      label: 'Moonshot Kimi K2.5',
      recommendedFor: 'coding',
    })

    expect(next.provider).toBe('openai')
    expect(next.baseURL).toBe('https://api.moonshot.cn')
    expect(next.model).toBe('kimi-k2.5')
    expect(next.apiKey).toBeUndefined()
  })

  test('remove active profile switches the whole endpoint context', () => {
    const next = buildStorageAfterProfileRemoval(baseStorage, 'deepseek-chat')

    expect(next.model).toBe('deepseek-reasoner')
    expect(next.baseURL).toBe('https://api.deepseek.com')
    expect(next.apiKey).toBe('sk-deepseek')

    const afterSecondRemoval = buildStorageAfterProfileRemoval(
      next,
      'deepseek-reasoner',
    )

    expect(afterSecondRemoval.model).toBe('kimi-k2.5')
    expect(afterSecondRemoval.baseURL).toBe('https://api.moonshot.cn')
    expect(afterSecondRemoval.apiKey).toBe('sk-moonshot')
  })

  test('updating an inactive profile key does not retarget the active session', () => {
    const next = buildStorageForApiKeyUpdate(
      baseStorage,
      'moonshot-kimi-k2.5',
      'sk-new-moonshot',
      'moonshot-kimi-k2.5',
    )

    expect(next.model).toBe('deepseek-chat')
    expect(next.baseURL).toBe('https://api.deepseek.com')
    expect(next.apiKey).toBe('sk-deepseek')
    expect(
      next.savedProfiles?.find(profile => profile.id === 'moonshot-kimi-k2.5')
        ?.apiKey,
    ).toBe('sk-new-moonshot')
  })

  test('active target detection supports ids and model names', () => {
    expect(isActiveCompatibleTarget(baseStorage, 'deepseek-chat')).toBe(true)
    expect(isActiveCompatibleTarget(baseStorage, 'moonshot-kimi-k2.5')).toBe(
      false,
    )
  })

  test('resolveCompatibleStorage keeps active profile api key when available', () => {
    const next = resolveCompatibleStorage(
      {
        provider: 'openai',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        savedProfiles: baseStorage.savedProfiles,
      },
      {},
    )

    expect(next.apiKey).toBe('sk-deepseek')
  })
})
