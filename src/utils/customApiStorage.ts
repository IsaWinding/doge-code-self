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
  const matches = findCustomApiProfileMatches(idOrModel, data)
  return matches.length === 1 ? matches[0] : undefined
}

export function findCustomApiProfileMatches(
  idOrModel: string,
  data: CustomApiStorageData = readCustomApiStorage(),
): readonly CustomApiProfile[] {
  const normalized = idOrModel.trim().toLowerCase()
  if (!normalized) return []

  const idMatch = (data.savedProfiles ?? []).find(
    item => item.id.toLowerCase() === normalized,
  )
  if (idMatch) return [idMatch]

  return (data.savedProfiles ?? []).filter(
    item => item.model.toLowerCase() === normalized,
  )
}

export function resolveCustomApiProfileTargets(
  idOrModel: string,
  data: CustomApiStorageData,
): readonly CustomApiProfile[] {
  const normalized = idOrModel.trim().toLowerCase()
  if (!normalized) return []

  const profiles = data.savedProfiles ?? []
  const idMatches = profiles.filter(
    item => item.id.toLowerCase() === normalized,
  )
  if (idMatches.length > 0) return idMatches

  const activeProfile = profiles.find(
    item =>
      item.provider === data.provider &&
      item.baseURL === data.baseURL &&
      item.model === data.model,
  )
  if (activeProfile?.model.toLowerCase() === normalized) {
    return [activeProfile]
  }

  const modelMatches = profiles.filter(
    item => item.model.toLowerCase() === normalized,
  )
  return modelMatches.length === 1 ? modelMatches : []
}

export function removeCustomApiProfile(
  idOrModel: string,
  data: CustomApiStorageData,
): CustomApiStorageData {
  const profiles = data.savedProfiles ?? []
  const targetIds = new Set(
    resolveCustomApiProfileTargets(idOrModel, data).map(item =>
      item.id.toLowerCase(),
    ),
  )

  return {
    ...data,
    savedProfiles: profiles.filter(
      item => !targetIds.has(item.id.toLowerCase()),
    ),
  }
}
