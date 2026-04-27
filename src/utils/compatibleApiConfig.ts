import type { GlobalConfig } from './config.js'
import {
  removeCustomApiProfile,
  resolveCustomApiProfileTargets,
  upsertCustomApiProfile,
  type CustomApiProfile,
  type CustomApiStorageData,
} from './customApiStorage.js'
import {
  findCustomModelPreset,
  getCustomModelPresets,
  type CustomModelPreset,
} from './customModelPresets.js'

type CompatibleTarget = Pick<
  CustomApiProfile,
  'provider' | 'baseURL'
> & {
  model?: string
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

export function dedupeCompatibleProfiles(
  profiles: readonly CustomApiProfile[],
): CustomApiProfile[] {
  const seen = new Set<string>()

  return profiles.filter(profile => {
    const key = `${profile.id.toLowerCase()}::${profile.provider}::${profile.baseURL}::${profile.model}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getCompatibleSavedModels(
  data: Pick<CustomApiStorageData, 'savedModels' | 'savedProfiles' | 'model'>,
): string[] {
  return uniqueStrings([
    ...(data.savedModels ?? []),
    ...((data.savedProfiles ?? []).map(profile => profile.model)),
    ...(data.model ? [data.model] : []),
  ])
}

export function getActiveCompatibleProfile(
  data: Pick<
    CustomApiStorageData,
    'savedProfiles' | 'provider' | 'baseURL' | 'model'
  >,
): CustomApiProfile | undefined {
  return (data.savedProfiles ?? []).find(
    profile =>
      profile.provider === data.provider &&
      profile.baseURL === data.baseURL &&
      profile.model === data.model,
  )
}

export function getActiveCompatiblePreset(
  data: Pick<CustomApiStorageData, 'provider' | 'baseURL' | 'model'>,
): CustomModelPreset | undefined {
  if (!data.provider || !data.baseURL || !data.model) return undefined
  const exactPreset = getCustomModelPresets().find(
    preset =>
      preset.provider === data.provider &&
      preset.baseURL === data.baseURL &&
      preset.model === data.model,
  )

  return exactPreset ?? findCustomModelPreset(data.model)
}

export function getCompatibleApiKeyForTarget(
  data: Pick<
    CustomApiStorageData,
    'savedProfiles' | 'provider' | 'baseURL' | 'apiKey'
  >,
  target: CompatibleTarget,
): string | undefined {
  const matchedProfile = (data.savedProfiles ?? []).find(
    profile =>
      profile.provider === target.provider &&
      profile.baseURL === target.baseURL &&
      (target.model ? profile.model === target.model : true),
  )

  if (matchedProfile?.apiKey) {
    return matchedProfile.apiKey
  }

  if (
    data.provider === target.provider &&
    data.baseURL === target.baseURL &&
    typeof data.apiKey === 'string' &&
    data.apiKey.trim().length > 0
  ) {
    return data.apiKey
  }

  return undefined
}

export function resolveCompatibleStorage(
  raw: CustomApiStorageData,
  fallback?: CustomApiStorageData,
): CustomApiStorageData {
  const provider = raw.provider ?? fallback?.provider
  const baseURL = raw.baseURL ?? fallback?.baseURL
  const model = raw.model ?? fallback?.model
  const sameTargetAsFallback =
    provider === fallback?.provider &&
    baseURL === fallback?.baseURL &&
    model === fallback?.model
  const fallbackApiKey = sameTargetAsFallback ? fallback?.apiKey : undefined
  const savedProfiles = dedupeCompatibleProfiles([
    ...(raw.savedProfiles ?? []),
    ...(fallback?.savedProfiles ?? []),
  ])
  const savedModels = getCompatibleSavedModels({
    savedModels: [...(raw.savedModels ?? []), ...(fallback?.savedModels ?? [])],
    savedProfiles,
    model,
  })

  if (!provider || !baseURL || !model) {
    return {
      ...raw,
      provider,
      baseURL,
      apiKey: raw.apiKey ?? fallbackApiKey,
      model,
      savedModels,
      savedProfiles,
    }
  }

  const activeProfile = savedProfiles.find(
    profile =>
      profile.provider === provider &&
      profile.baseURL === baseURL &&
      profile.model === model,
  )

  if (activeProfile) {
    return {
      ...raw,
      provider,
      baseURL,
      apiKey: raw.apiKey ?? activeProfile.apiKey ?? fallbackApiKey,
      model,
      savedModels,
      savedProfiles,
    }
  }

  const matchedPreset = getCustomModelPresets().find(
    preset =>
      preset.provider === provider &&
      preset.baseURL === baseURL &&
      preset.model === model,
  )

  return {
    ...raw,
    provider,
    baseURL,
    apiKey: raw.apiKey ?? fallbackApiKey,
    model,
    savedModels,
    savedProfiles: dedupeCompatibleProfiles([
      ...savedProfiles,
      {
        id: matchedPreset?.id ?? model,
        provider,
        baseURL,
        apiKey: raw.apiKey ?? fallbackApiKey,
        model,
      },
    ]),
  }
}

export function buildGlobalCompatibleConfig(
  data: CustomApiStorageData,
): NonNullable<GlobalConfig['customApiEndpoint']> {
  return {
    provider: data.provider,
    baseURL: data.baseURL,
    apiKey: undefined,
    model: data.model,
    savedModels: getCompatibleSavedModels(data),
  }
}

export function syncCompatibleApiEnv(
  data: Pick<CustomApiStorageData, 'provider' | 'baseURL' | 'apiKey' | 'model'>,
): void {
  if (data.provider) {
    process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = data.provider
  } else {
    delete process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER
  }

  if (data.baseURL) {
    process.env.ANTHROPIC_BASE_URL = data.baseURL
  } else {
    delete process.env.ANTHROPIC_BASE_URL
  }

  if (data.model) {
    process.env.ANTHROPIC_MODEL = data.model
  } else {
    delete process.env.ANTHROPIC_MODEL
  }

  if (data.apiKey) {
    process.env.DOGE_API_KEY = data.apiKey
  } else {
    delete process.env.DOGE_API_KEY
  }
}

export function buildStorageForPresetSelection(
  current: CustomApiStorageData,
  preset: CustomModelPreset,
): CustomApiStorageData {
  const matchedProfile = (current.savedProfiles ?? []).find(
    profile =>
      profile.provider === preset.provider &&
      profile.baseURL === preset.baseURL &&
      profile.model === preset.model,
  )
  const nextApiKey = getCompatibleApiKeyForTarget(current, preset)

  return resolveCompatibleStorage(
    upsertCustomApiProfile(
      {
        ...current,
        provider: preset.provider,
        baseURL: preset.baseURL,
        apiKey: nextApiKey,
        model: preset.model,
        savedModels: uniqueStrings([
          ...(current.savedModels ?? []),
          preset.model,
        ]),
      },
      {
        id: matchedProfile?.id ?? preset.id,
        provider: preset.provider,
        baseURL: preset.baseURL,
        apiKey: nextApiKey,
        model: preset.model,
      },
    ),
    current,
  )
}

export function buildStorageForProfileSelection(
  current: CustomApiStorageData,
  profile: CustomApiProfile,
): CustomApiStorageData {
  return resolveCompatibleStorage(
    {
      ...current,
      provider: profile.provider,
      baseURL: profile.baseURL,
      apiKey: profile.apiKey,
      model: profile.model,
      savedModels: uniqueStrings([...(current.savedModels ?? []), profile.model]),
      savedProfiles: dedupeCompatibleProfiles([
        ...(current.savedProfiles ?? []),
        profile,
      ]),
    },
    current,
  )
}

export function buildStorageForManualModel(
  current: CustomApiStorageData,
  nextModel: string,
  currentBaseURL: string,
): CustomApiStorageData {
  const base = {
    ...current,
    model: nextModel,
    savedModels: uniqueStrings([...(current.savedModels ?? []), nextModel]),
  }

  if (!currentBaseURL.trim()) {
    return resolveCompatibleStorage(base, current)
  }

  const provider = current.provider ?? 'anthropic'
  const nextApiKey = getCompatibleApiKeyForTarget(current, {
    provider,
    baseURL: currentBaseURL,
    model: nextModel,
  })

  return resolveCompatibleStorage(
    upsertCustomApiProfile(base, {
      id: nextModel,
      provider,
      baseURL: currentBaseURL,
      apiKey: nextApiKey,
      model: nextModel,
    }),
    current,
  )
}

export function buildStorageForApiKeyUpdate(
  current: CustomApiStorageData,
  targetIdOrModel: string,
  apiKey: string | undefined,
  fallbackProfileId?: string,
): CustomApiStorageData {
  const trimmedApiKey = apiKey?.trim() ? apiKey.trim() : undefined
  const activeProfile = getActiveCompatibleProfile(current)
  const targetProfileIds = new Set(
    resolveCustomApiProfileTargets(targetIdOrModel, current).map(profile =>
      profile.id.toLowerCase(),
    ),
  )

  const nextStorageBase: CustomApiStorageData = {
    ...current,
    apiKey: isActiveCompatibleTarget(current, targetIdOrModel)
      ? trimmedApiKey
      : current.apiKey,
    savedProfiles: (current.savedProfiles ?? []).map(profile =>
      targetProfileIds.has(profile.id.toLowerCase())
        ? { ...profile, apiKey: trimmedApiKey }
        : profile,
    ),
  }

  if (activeProfile) {
    return resolveCompatibleStorage(
      upsertCustomApiProfile(nextStorageBase, {
        ...activeProfile,
        apiKey:
          targetProfileIds.has(activeProfile.id.toLowerCase())
            ? trimmedApiKey
            : activeProfile.apiKey,
      }),
      current,
    )
  }

  if (
    nextStorageBase.provider &&
    nextStorageBase.baseURL &&
    nextStorageBase.model &&
    isActiveCompatibleTarget(nextStorageBase, targetIdOrModel)
  ) {
    return resolveCompatibleStorage(
      upsertCustomApiProfile(nextStorageBase, {
        id: fallbackProfileId ?? nextStorageBase.model,
        provider: nextStorageBase.provider,
        baseURL: nextStorageBase.baseURL,
        apiKey: trimmedApiKey,
        model: nextStorageBase.model,
      }),
      current,
    )
  }

  return resolveCompatibleStorage(nextStorageBase, current)
}

export function buildStorageAfterProfileRemoval(
  current: CustomApiStorageData,
  targetIdOrModel: string,
): CustomApiStorageData {
  const next = removeCustomApiProfile(targetIdOrModel, current)
  const activeProfile = getActiveCompatibleProfile(next)
  const savedModels = getCompatibleSavedModels(next)
  const fallbackAfterRemoval = {
    ...current,
    savedModels,
    savedProfiles: next.savedProfiles,
  }

  if (activeProfile) {
    return resolveCompatibleStorage(
      {
        ...next,
        apiKey: activeProfile.apiKey,
        savedModels,
      },
      fallbackAfterRemoval,
    )
  }

  const fallbackProfile = (next.savedProfiles ?? [])[0]

  if (!fallbackProfile) {
    return {
      ...next,
      provider: undefined,
      baseURL: undefined,
      apiKey: undefined,
      model: undefined,
      savedModels,
      savedProfiles: [],
    }
  }

  return resolveCompatibleStorage(
    {
      ...next,
      provider: fallbackProfile.provider,
      baseURL: fallbackProfile.baseURL,
      apiKey: fallbackProfile.apiKey,
      model: fallbackProfile.model,
      savedModels,
    },
    fallbackAfterRemoval,
  )
}

export function isActiveCompatibleTarget(
  data: Pick<
    CustomApiStorageData,
    'savedProfiles' | 'provider' | 'baseURL' | 'model'
  >,
  targetIdOrModel: string,
): boolean {
  const normalizedTarget = targetIdOrModel.trim().toLowerCase()
  if (!normalizedTarget) return false

  const activeProfile = getActiveCompatibleProfile(data)

  if (activeProfile) {
    return (
      activeProfile.id.toLowerCase() === normalizedTarget ||
      activeProfile.model.toLowerCase() === normalizedTarget
    )
  }

  return data.model?.toLowerCase() === normalizedTarget
}
