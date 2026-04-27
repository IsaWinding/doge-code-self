import { describe, expect, test } from 'bun:test'
import {
  buildStorageAfterProfileRemoval,
  buildStorageForApiKeyUpdate,
  buildStorageForPresetSelection,
  getActiveCompatiblePreset,
  isActiveCompatibleTarget,
  resolveCompatibleStorage,
} from './compatibleApiConfig.js'
import {
  findCustomApiProfile,
  findCustomApiProfileMatches,
  type CustomApiStorageData,
} from './customApiStorage.js'

const baseStorage: CustomApiStorageData = {
  provider: 'openai',
  baseURL: 'https://api.deepseek.com',
  apiKey: 'sk-deepseek',
  model: 'deepseek-v4-flash',
  savedModels: ['deepseek-v4-flash', 'deepseek-v4-pro', 'kimi-k2.5'],
  savedProfiles: [
    {
      id: 'deepseek-v4-flash',
      provider: 'openai',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-deepseek',
      model: 'deepseek-v4-flash',
    },
    {
      id: 'deepseek-v4-pro',
      provider: 'openai',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'sk-deepseek',
      model: 'deepseek-v4-pro',
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
      model: 'deepseek-v4-flash',
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
    const next = buildStorageAfterProfileRemoval(baseStorage, 'deepseek-v4-flash')

    expect(next.model).toBe('deepseek-v4-pro')
    expect(next.baseURL).toBe('https://api.deepseek.com')
    expect(next.apiKey).toBe('sk-deepseek')

    const afterSecondRemoval = buildStorageAfterProfileRemoval(
      next,
      'deepseek-v4-pro',
    )

    expect(afterSecondRemoval.model).toBe('kimi-k2.5')
    expect(afterSecondRemoval.baseURL).toBe('https://api.moonshot.cn')
    expect(afterSecondRemoval.apiKey).toBe('sk-moonshot')
  })

  test('model-name removal only removes the active profile when aliases collide', () => {
    const storage: CustomApiStorageData = {
      ...baseStorage,
      provider: 'openai',
      baseURL: 'https://api.moonshot.cn',
      apiKey: 'sk-moonshot',
      model: 'kimi-k2.5',
      savedProfiles: [
        ...baseStorage.savedProfiles!,
        {
          id: 'bailian-kimi-k2.5',
          provider: 'anthropic',
          baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
          apiKey: 'sk-bailian',
          model: 'kimi-k2.5',
        },
      ],
    }

    const next = buildStorageAfterProfileRemoval(storage, 'kimi-k2.5')

    expect(
      next.savedProfiles?.some(profile => profile.id === 'moonshot-kimi-k2.5'),
    ).toBe(false)
    expect(
      next.savedProfiles?.some(profile => profile.id === 'bailian-kimi-k2.5'),
    ).toBe(true)
    expect(next.baseURL).toBe('https://api.deepseek.com')
    expect(next.model).toBe('deepseek-v4-flash')
  })

  test('updating an inactive profile key does not retarget the active session', () => {
    const next = buildStorageForApiKeyUpdate(
      baseStorage,
      'moonshot-kimi-k2.5',
      'sk-new-moonshot',
      'moonshot-kimi-k2.5',
    )

    expect(next.model).toBe('deepseek-v4-flash')
    expect(next.baseURL).toBe('https://api.deepseek.com')
    expect(next.apiKey).toBe('sk-deepseek')
    expect(
      next.savedProfiles?.find(profile => profile.id === 'moonshot-kimi-k2.5')
        ?.apiKey,
    ).toBe('sk-new-moonshot')
  })

  test('profile lookup avoids ambiguous model aliases', () => {
    const storage: CustomApiStorageData = {
      ...baseStorage,
      savedProfiles: [
        ...baseStorage.savedProfiles!,
        {
          id: 'bailian-kimi-k2.5',
          provider: 'anthropic',
          baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
          apiKey: 'sk-bailian',
          model: 'kimi-k2.5',
        },
      ],
    }

    expect(findCustomApiProfile('kimi-k2.5', storage)).toBeUndefined()
    expect(
      findCustomApiProfileMatches('kimi-k2.5', storage).map(
        profile => profile.id,
      ),
    ).toEqual(['moonshot-kimi-k2.5', 'bailian-kimi-k2.5'])
    expect(findCustomApiProfile('moonshot-kimi-k2.5', storage)?.baseURL).toBe(
      'https://api.moonshot.cn',
    )
  })

  test('model-name api key updates only the active profile when aliases collide', () => {
    const storage: CustomApiStorageData = {
      ...baseStorage,
      provider: 'openai',
      baseURL: 'https://api.moonshot.cn',
      apiKey: 'sk-moonshot',
      model: 'kimi-k2.5',
      savedProfiles: [
        ...baseStorage.savedProfiles!,
        {
          id: 'bailian-kimi-k2.5',
          provider: 'anthropic',
          baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
          apiKey: 'sk-bailian',
          model: 'kimi-k2.5',
        },
      ],
    }

    const next = buildStorageForApiKeyUpdate(
      storage,
      'kimi-k2.5',
      'sk-new-active-kimi',
    )

    expect(next.apiKey).toBe('sk-new-active-kimi')
    expect(
      next.savedProfiles?.find(profile => profile.id === 'moonshot-kimi-k2.5')
        ?.apiKey,
    ).toBe('sk-new-active-kimi')
    expect(
      next.savedProfiles?.find(profile => profile.id === 'bailian-kimi-k2.5')
        ?.apiKey,
    ).toBe('sk-bailian')
  })

  test('active target detection supports ids and model names', () => {
    expect(isActiveCompatibleTarget(baseStorage, 'deepseek-v4-flash')).toBe(true)
    expect(isActiveCompatibleTarget(baseStorage, 'moonshot-kimi-k2.5')).toBe(
      false,
    )
  })

  test('resolveCompatibleStorage keeps active profile api key when available', () => {
    const next = resolveCompatibleStorage(
      {
        provider: 'openai',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        savedProfiles: baseStorage.savedProfiles,
      },
      {},
    )

    expect(next.apiKey).toBe('sk-deepseek')
  })

  test('active preset resolution prefers exact endpoint over duplicate model lookup', () => {
    expect(
      getActiveCompatiblePreset({
        provider: 'anthropic',
        baseURL: 'https://dashscope.aliyuncs.com/apps/anthropic',
        model: 'kimi-k2.5',
      })?.id,
    ).toBe('bailian-kimi-k2.5')

    expect(
      getActiveCompatiblePreset({
        provider: 'openai',
        baseURL: 'https://api.moonshot.cn',
        model: 'kimi-k2.5',
      })?.id,
    ).toBe('moonshot-kimi-k2.5')
  })
})
