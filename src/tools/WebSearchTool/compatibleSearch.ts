import {
  getEffectiveSearchBackendBaseURL,
  readSearchBackendStorage,
  type SearchBackendId,
} from 'src/utils/searchBackendStorage.js'

export type CompatibleSearchHit = {
  title: string
  url: string
  snippet?: string
  publishedDate?: string
}

export type CompatibleSearchResponse = {
  backend: SearchBackendId
  hits: CompatibleSearchHit[]
}

type JsonRecord = Record<string, unknown>

function joinBaseUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/$/, '')}${path}`
}

async function parseJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `Search backend request failed with status ${response.status}${text ? `: ${text}` : ''}`,
    )
  }
  if (!text) return {}
  return JSON.parse(text) as JsonRecord
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function normalizeHits(rawHits: unknown[], maxResults = 8): CompatibleSearchHit[] {
  return rawHits
    .flatMap(hit => {
      if (!hit || typeof hit !== 'object') return []
      const item = hit as JsonRecord
      const title =
        asString(item.title) ??
        asString(item.name) ??
        asString(item.url) ??
        asString(item.link)
      const url = asString(item.url) ?? asString(item.link)
      if (!title || !url) return []
      return [{
        title,
        url,
        snippet:
          asString(item.snippet) ??
          asString(item.content) ??
          asString(item.description),
        publishedDate:
          asString(item.publishedDate) ??
          asString(item.published_date) ??
          asString(item.date),
      }]
    })
    .slice(0, maxResults)
}

async function searchWithTavily(
  query: string,
  apiKey: string,
  baseURL: string,
  signal?: AbortSignal,
): Promise<CompatibleSearchResponse> {
  const response = await fetch(joinBaseUrl(baseURL, '/search'), {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
    }),
  })
  const payload = await parseJsonResponse(response)
  const rawResults = Array.isArray(payload.results) ? payload.results : []
  return {
    backend: 'tavily',
    hits: normalizeHits(rawResults),
  }
}

async function searchWithSerper(
  query: string,
  apiKey: string,
  baseURL: string,
  signal?: AbortSignal,
): Promise<CompatibleSearchResponse> {
  const response = await fetch(joinBaseUrl(baseURL, '/search'), {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: 8,
      autocorrect: true,
    }),
  })
  const payload = await parseJsonResponse(response)
  const rawResults = Array.isArray(payload.organic) ? payload.organic : []
  return {
    backend: 'serper',
    hits: normalizeHits(rawResults),
  }
}

async function searchWithSearXNG(
  query: string,
  apiKey: string | undefined,
  baseURL: string,
  signal?: AbortSignal,
): Promise<CompatibleSearchResponse> {
  const url = new URL(joinBaseUrl(baseURL, '/search'))
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'json')
  url.searchParams.set('language', 'auto')
  url.searchParams.set('safesearch', '0')

  const response = await fetch(url.toString(), {
    method: 'GET',
    signal,
    headers: apiKey
      ? {
          authorization: `Bearer ${apiKey}`,
        }
      : undefined,
  })
  const payload = await parseJsonResponse(response)
  const rawResults = Array.isArray(payload.results) ? payload.results : []
  return {
    backend: 'searxng',
    hits: normalizeHits(rawResults),
  }
}

export async function searchWithConfiguredBackend(
  query: string,
  signal?: AbortSignal,
): Promise<CompatibleSearchResponse> {
  const config = readSearchBackendStorage()
  const backend = config.backend
  const apiKey = config.apiKey?.trim()
  const baseURL = getEffectiveSearchBackendBaseURL(config)?.trim()

  if (!backend) {
    throw new Error(
      'No search backend configured. Open /config and set Search backend first.',
    )
  }
  if (!baseURL) {
    throw new Error(
      'Search backend URL is missing. Open /config and set Search backend URL.',
    )
  }

  if (backend === 'tavily') {
    if (!apiKey) {
      throw new Error(
        'Tavily API key is missing. Open /config and set Search API key.',
      )
    }
    return searchWithTavily(query, apiKey, baseURL, signal)
  }

  if (backend === 'serper') {
    if (!apiKey) {
      throw new Error(
        'Serper API key is missing. Open /config and set Search API key.',
      )
    }
    return searchWithSerper(query, apiKey, baseURL, signal)
  }

  return searchWithSearXNG(query, apiKey, baseURL, signal)
}
