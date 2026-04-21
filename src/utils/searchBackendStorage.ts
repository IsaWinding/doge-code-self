import { getSecureStorage } from './secureStorage/index.js'

export type SearchBackendId = 'tavily' | 'serper' | 'searxng'

export type SearchBackendDefinition = {
  id: SearchBackendId
  label: string
  description: string
  defaultBaseURL?: string
  requiresApiKey: boolean
  requiresBaseURL: boolean
}

export type SearchBackendStorageData = {
  backend?: SearchBackendId
  apiKey?: string
  baseURL?: string
}

const SEARCH_BACKEND_STORAGE_KEY = 'searchBackend'

export const SEARCH_BACKEND_DEFINITIONS: readonly SearchBackendDefinition[] = [
  {
    id: 'tavily',
    label: 'Tavily',
    description: 'Best general web search fallback for compatible models',
    defaultBaseURL: 'https://api.tavily.com',
    requiresApiKey: true,
    requiresBaseURL: false,
  },
  {
    id: 'serper',
    label: 'Serper (Google)',
    description: 'Google-backed search results with strong freshness',
    defaultBaseURL: 'https://google.serper.dev',
    requiresApiKey: true,
    requiresBaseURL: false,
  },
  {
    id: 'searxng',
    label: 'SearXNG (self-hosted)',
    description: 'Self-hosted metasearch endpoint for full control',
    requiresApiKey: false,
    requiresBaseURL: true,
  },
] as const

export function getSearchBackendDefinition(
  backend: SearchBackendId | undefined,
): SearchBackendDefinition | undefined {
  if (!backend) return undefined
  return SEARCH_BACKEND_DEFINITIONS.find(item => item.id === backend)
}

export function readSearchBackendStorage(): SearchBackendStorageData {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  const raw = data[SEARCH_BACKEND_STORAGE_KEY]
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>
  return {
    backend:
      value.backend === 'tavily' ||
      value.backend === 'serper' ||
      value.backend === 'searxng'
        ? value.backend
        : undefined,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    baseURL: typeof value.baseURL === 'string' ? value.baseURL : undefined,
  }
}

export function writeSearchBackendStorage(
  next: SearchBackendStorageData,
): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  storage.update?.({
    ...current,
    [SEARCH_BACKEND_STORAGE_KEY]: next,
  })
}

export function clearSearchBackendStorage(): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const current = storage.read?.() ?? {}
  const { [SEARCH_BACKEND_STORAGE_KEY]: _, ...rest } = current
  storage.update?.(rest)
}

export function getEffectiveSearchBackendBaseURL(
  data: SearchBackendStorageData,
): string | undefined {
  const customBaseURL = data.baseURL?.trim()
  if (customBaseURL) return customBaseURL
  return getSearchBackendDefinition(data.backend)?.defaultBaseURL
}

export function isSearchBackendConfigured(
  data: SearchBackendStorageData = readSearchBackendStorage(),
): boolean {
  const definition = getSearchBackendDefinition(data.backend)
  if (!definition) return false
  if (definition.requiresApiKey && !data.apiKey?.trim()) return false
  if (definition.requiresBaseURL && !getEffectiveSearchBackendBaseURL(data)) {
    return false
  }
  return true
}
