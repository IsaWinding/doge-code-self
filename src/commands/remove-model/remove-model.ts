import type { LocalCommandCall } from '../../types/command.js'
import { saveGlobalConfig, getGlobalConfig } from '../../utils/config.js'
import {
  buildGlobalCompatibleConfig,
  buildStorageAfterProfileRemoval,
  syncCompatibleApiEnv,
} from '../../utils/compatibleApiConfig.js'
import {
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async (args, _context) => {
  const targetModel = args.trim()
  if (!targetModel) {
    return {
      type: 'text',
      value: 'Usage: /remove-model <model-name>',
    }
  }

  const currentConfig = getGlobalConfig()
  const savedModels = currentConfig.customApiEndpoint?.savedModels ?? []
  if (!savedModels.includes(targetModel)) {
    return {
      type: 'text',
      value: `Model not found in saved list: ${targetModel}`,
    }
  }

  const secureStored = readCustomApiStorage()
  const nextStorage = buildStorageAfterProfileRemoval(secureStored, targetModel)

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
    value: `Removed custom model: ${targetModel}`,
  }
}
