import type { LocalCommandCall } from '../types/command.js'
import { saveGlobalConfig } from '../utils/config.js'
import {
  buildGlobalCompatibleConfig,
  buildStorageForPresetSelection,
  buildStorageForProfileSelection,
  syncCompatibleApiEnv,
} from '../utils/compatibleApiConfig.js'
import {
  findCustomApiProfile,
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../utils/customApiStorage.js'
import {
  findCustomModelPreset,
  findCustomModelPresetMatches,
} from '../utils/customModelPresets.js'

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
    const nextStorage = buildStorageForProfileSelection(
      secureStored,
      existingProfile,
    )

    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        ...current.customApiEndpoint,
        ...buildGlobalCompatibleConfig(nextStorage),
      },
    }))
    writeCustomApiStorage(nextStorage)
    syncCompatibleApiEnv(nextStorage)

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
    const presetMatches = findCustomModelPresetMatches(target)
    if (presetMatches.length > 1) {
      return {
        type: 'text',
        value:
          `Ambiguous model preset: ${target}\n` +
          'Use one of these preset ids:\n' +
          presetMatches
            .map(
              match =>
                `- ${match.id}: provider=${match.provider}, baseURL=${match.baseURL}, model=${match.model}`,
            )
            .join('\n'),
      }
    }

    return {
      type: 'text',
      value:
        `Unknown model or profile: ${target}\n` +
        'Run /list-models to see saved profiles or /add-model --list-presets for builtin presets.',
    }
  }

  const nextStorage = buildStorageForPresetSelection(secureStored, preset)

  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      ...buildGlobalCompatibleConfig(nextStorage),
    },
  }))
  writeCustomApiStorage(nextStorage)
  syncCompatibleApiEnv(nextStorage)

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
