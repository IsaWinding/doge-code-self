import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  findCustomApiProfile,
  readCustomApiStorage,
  upsertCustomApiProfile,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'
import { findCustomModelPreset } from '../../utils/customModelPresets.js'

export const call: LocalCommandCall = async (args, _context) => {
  const target = args.trim()
  if (!target) {
    return {
      type: 'text',
      value: 'Usage: /use-model <model-or-profile-id>',
    }
  }

  const secureStored = readCustomApiStorage()
  const existingProfile = findCustomApiProfile(target, secureStored)

  if (existingProfile) {
    writeCustomApiStorage({
      ...secureStored,
      provider: existingProfile.provider,
      baseURL: existingProfile.baseURL,
      apiKey: existingProfile.apiKey,
      model: existingProfile.model,
    })

    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        ...current.customApiEndpoint,
        provider: existingProfile.provider,
        baseURL: existingProfile.baseURL,
        apiKey: undefined,
        model: existingProfile.model,
        savedModels: [
          ...new Set([
            ...(current.customApiEndpoint?.savedModels ?? []),
            existingProfile.model,
          ]),
        ],
      },
    }))

    process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = existingProfile.provider
    process.env.ANTHROPIC_BASE_URL = existingProfile.baseURL
    process.env.ANTHROPIC_MODEL = existingProfile.model
    if (existingProfile.apiKey) {
      process.env.DOGE_API_KEY = existingProfile.apiKey
    } else {
      delete process.env.DOGE_API_KEY
    }

    return {
      type: 'text',
      value:
        `Now using ${existingProfile.id}\n` +
        `provider=${existingProfile.provider}\n` +
        `baseURL=${existingProfile.baseURL}\n` +
        `model=${existingProfile.model}` +
        (existingProfile.apiKey
          ? ''
          : '\nNo API key stored for this profile. Run /set-api-key first.'),
    }
  }

  const preset = findCustomModelPreset(target)
  if (!preset) {
    return {
      type: 'text',
      value:
        `Unknown model or profile: ${target}\n` +
        'Run /list-models to see saved profiles or /add-model --list-presets for builtin presets.',
    }
  }

  const nextStorage = upsertCustomApiProfile(
    {
      ...secureStored,
      provider: preset.provider,
      baseURL: preset.baseURL,
      model: preset.model,
      savedModels: [...new Set([...(secureStored.savedModels ?? []), preset.model])],
    },
    {
      id: preset.id,
      provider: preset.provider,
      baseURL: preset.baseURL,
      apiKey: secureStored.apiKey,
      model: preset.model,
    },
  )
  writeCustomApiStorage(nextStorage)

  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      provider: preset.provider,
      baseURL: preset.baseURL,
      apiKey: undefined,
      model: preset.model,
      savedModels: [
        ...new Set([...(current.customApiEndpoint?.savedModels ?? []), preset.model]),
      ],
    },
  }))

  process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = preset.provider
  process.env.ANTHROPIC_BASE_URL = preset.baseURL
  process.env.ANTHROPIC_MODEL = preset.model

  return {
    type: 'text',
    value:
      `Now using preset ${preset.id}\n` +
      `provider=${preset.provider}\n` +
      `baseURL=${preset.baseURL}\n` +
      `model=${preset.model}\n` +
      'If this vendor needs a different key, run /set-api-key ' +
      preset.id +
      ' <api-key>.',
  }
}
