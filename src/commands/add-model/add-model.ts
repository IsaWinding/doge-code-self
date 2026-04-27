import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  buildGlobalCompatibleConfig,
  buildStorageForManualModel,
  buildStorageForPresetSelection,
  getActiveCompatibleProfile,
  syncCompatibleApiEnv,
} from '../../utils/compatibleApiConfig.js'
import {
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'
import {
  findCustomModelPreset,
  findCustomModelPresetMatches,
  renderCustomModelPresetList,
} from '../../utils/customModelPresets.js'

export const call: LocalCommandCall = async (args, _context) => {
  const trimmedArgs = args.trim()
  if (!trimmedArgs) {
    return {
      type: 'text',
      value:
        'Usage: /add-model <model-name>\n' +
        '   or: /add-model --preset <preset-id>\n' +
        '   or: /add-model --list-presets',
    }
  }

  if (trimmedArgs === '--list-presets') {
    return {
      type: 'text',
      value:
        'Available model presets:\n' +
        `${renderCustomModelPresetList()}\n\n` +
        'Example: /add-model --preset bailian-qwen3-coder-next',
    }
  }

  const presetMatch = trimmedArgs.match(/^--preset\s+(.+)$/)
  if (presetMatch) {
    const presetId = presetMatch[1]?.trim() ?? ''
    const preset = findCustomModelPreset(presetId)
    if (!preset) {
      const presetMatches = findCustomModelPresetMatches(presetId)
      if (presetMatches.length > 1) {
        return {
          type: 'text',
          value:
            `Ambiguous preset: ${presetId}\n` +
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
          `Unknown preset: ${presetId}\n` +
          'Run /add-model --list-presets to see available presets.',
      }
    }

    const secureStored = readCustomApiStorage()
    const nextStorage = buildStorageForPresetSelection(secureStored, preset)
    const activeProfile = getActiveCompatibleProfile(nextStorage)

    saveGlobalConfig(current => ({
      ...current,
      customApiEndpoint: {
        ...current.customApiEndpoint,
        ...buildGlobalCompatibleConfig(nextStorage),
      },
    }))
    writeCustomApiStorage(nextStorage)
    syncCompatibleApiEnv(nextStorage)

    const hasApiKey = Boolean((activeProfile?.apiKey ?? '').trim())
    return {
      type: 'text',
      value:
        `Configured preset ${preset.id}\n` +
        `provider=${preset.provider}\n` +
        `baseURL=${preset.baseURL}\n` +
        `model=${preset.model}` +
        (hasApiKey
          ? ''
          : '\nAPI key unchanged. Configure it with /set-api-key before using this preset.'),
    }
  }

  const nextModel = trimmedArgs
  const secureStored = readCustomApiStorage()
  const currentBaseURL = secureStored.baseURL ?? process.env.ANTHROPIC_BASE_URL ?? ''
  const nextStorage = buildStorageForManualModel(
    secureStored,
    nextModel,
    currentBaseURL,
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
      `Added custom model: ${nextModel}` +
      (currentBaseURL.trim().length > 0
        ? `\nYou can switch back to it later with /use-model ${nextModel}.`
        : '\nNo compatible endpoint is configured yet, so only the model name was saved.'),
  }
}
