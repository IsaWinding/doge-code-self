import { getSecureStorage } from './secureStorage/index.js'

export type CustomApiProfile = {
  id: string
  provider: 'anthropic' | 'openai'
  baseURL: string
  apiKey?: string
  model: string
}

export type CustomApiStorageData = {
  provider?: 'anthropic' | 'openai'
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
  savedProfiles?: CustomApiProfile[]
}

const CUSTOM_API_STORAGE_KEY = 'customApiEndpoint'

export function readCustomApiStorage(): CustomApiStorageData {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  const raw = data[CUSTOM_API_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>
  return {
    provider:
      value.provider === 'openai' || value.provider === 'anthropic'
        ? value.provider
        : undefined,
    baseURL: typeof value.baseURL === 'string' ? value.baseURL : undefined,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    savedModels: Array.isArray(value.savedModels)
      ? value.savedModels.filter((item): item is string => typeof item === 'string')
      : [],
    savedProfiles: Array.isArray(value.savedProfiles)
      ? value.savedProfiles.flatMap(item => normalizeCustomApiProfile(item))
      : [],
  }
}

export function writeCustomApiStorage(next: CustomApiStorageData): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  storage.update?.({
    ...current,
    customApiEndpoint: next,
  })
}

export function clearCustomApiStorage(): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  const { customApiEndpoint: _, ...rest } = current
  storage.update?.(rest)
}

function normalizeCustomApiProfile(value: unknown): CustomApiProfile[] {
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const provider =
    item.provider === 'openai' || item.provider === 'anthropic'
      ? item.provider
      : undefined
  const baseURL = typeof item.baseURL === 'string' ? item.baseURL.trim() : ''
  const model = typeof item.model === 'string' ? item.model.trim() : ''
  const apiKey =
    typeof item.apiKey === 'string' && item.apiKey.trim().length > 0
      ? item.apiKey
      : undefined

  if (!id || !provider || !baseURL || !model) return []

  return [
    {
      id,
      provider,
      baseURL,
      apiKey,
      model,
    },
  ]
}

export function upsertCustomApiProfile(
  data: CustomApiStorageData,
  profile: CustomApiProfile,
): CustomApiStorageData {
  const nextProfiles = (data.savedProfiles ?? []).filter(
    item => item.id.toLowerCase() !== profile.id.toLowerCase(),
  )
  nextProfiles.push(profile)
  return {
    ...data,
    savedProfiles: nextProfiles,
  }
}

export function findCustomApiProfile(
  idOrModel: string,
  data: CustomApiStorageData = readCustomApiStorage(),
): CustomApiProfile | undefined {
  const normalized = idOrModel.trim().toLowerCase()
  if (!normalized) return undefined

  return (data.savedProfiles ?? []).find(
    item =>
      item.id.toLowerCase() === normalized ||
      item.model.toLowerCase() === normalized,
  )
}

export function removeCustomApiProfile(
  idOrModel: string,
  data: CustomApiStorageData,
): CustomApiStorageData {
  const normalized = idOrModel.trim().toLowerCase()
  return {
    ...data,
    savedProfiles: (data.savedProfiles ?? []).filter(
      item =>
        item.id.toLowerCase() !== normalized &&
        item.model.toLowerCase() !== normalized,
    ),
  }
}
