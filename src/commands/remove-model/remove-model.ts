import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig, getGlobalConfig } from '../../utils/config.js'
import {
  buildGlobalCompatibleConfig,
  buildStorageAfterProfileRemoval,
  syncCompatibleApiEnv,
} from '../../utils/compatibleApiConfig.js'
import {
  findCustomApiProfileMatches,
  readCustomApiStorage,
  resolveCustomApiProfileTargets,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async (args, _context) => {
  const target = args.trim()
  if (!target) {
    return {
      type: 'text',
      value: 'Usage: /remove-model <model-or-profile-id>',
    }
  }

  const secureStored = readCustomApiStorage()
  const targetProfiles = resolveCustomApiProfileTargets(target, secureStored)

  if (targetProfiles.length === 0) {
    const profileMatches = findCustomApiProfileMatches(target, secureStored)
    if (profileMatches.length > 1) {
      return {
        type: 'text',
        value:
          `Ambiguous model profile: ${target}\n` +
          'Use one of these profile ids:\n' +
          profileMatches
            .map(
              match =>
                `- ${match.id}: provider=${match.provider}, baseURL=${match.baseURL}, model=${match.model}`,
            )
            .join('\n'),
      }
    }

    const currentConfig = getGlobalConfig()
    const savedModels = currentConfig.customApiEndpoint?.savedModels ?? []
    if (savedModels.includes(target)) {
      return {
        type: 'text',
        value:
          `Model has no saved endpoint profile: ${target}\n` +
          'Run /list-models to see removable saved profiles.',
      }
    }

    return {
      type: 'text',
      value: `Model or profile not found: ${target}`,
    }
  }

  const nextStorage = buildStorageAfterProfileRemoval(secureStored, target)

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
      targetProfiles.length === 1
        ? `Removed custom model profile: ${targetProfiles[0]?.id}`
        : `Removed custom model: ${target}`,
  }
}
