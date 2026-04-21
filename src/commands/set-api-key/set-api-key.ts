import type { LocalCommandCall } from '../../types/command.js'
import { normalizeApiKeyForConfig } from '../../utils/authPortable.js'
import { saveGlobalConfig } from '../../utils/config.js'
import {
  findCustomApiProfile,
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'

function parseArgs(
  args: string,
): { targetId?: string; apiKey?: string; error?: string } {
  const trimmed = args.trim()
  if (!trimmed) {
    return {
      error:
        'Usage: /set-api-key <api-key>\n' +
        '   or: /set-api-key <model-or-profile> <api-key>',
    }
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { apiKey: parts[0] }
  }

  return {
    targetId: parts.slice(0, -1).join(' '),
    apiKey: parts[parts.length - 1],
  }
}

export const call: LocalCommandCall = async (args, context) => {
  const parsed = parseArgs(args)
  if (parsed.error || !parsed.apiKey) {
    return {
      type: 'text',
      value: parsed.error ?? 'Usage: /set-api-key <api-key>',
    }
  }

  const secureStored = readCustomApiStorage()
  const activeModel = secureStored.model
  const targetId = parsed.targetId?.trim() || activeModel

  if (!targetId) {
    return {
      type: 'text',
      value:
        'No active custom model found.\n' +
        'Use /add-model or /add-model --preset first, then run /set-api-key.',
    }
  }

  const nextApiKey = parsed.apiKey.trim()
  const profile = findCustomApiProfile(targetId, secureStored)
  const nextStorage = {
    ...secureStored,
    apiKey: nextApiKey,
    savedProfiles: (secureStored.savedProfiles ?? []).map(item =>
      item.id.toLowerCase() === targetId.toLowerCase() ||
      item.model.toLowerCase() === targetId.toLowerCase()
        ? { ...item, apiKey: nextApiKey }
        : item,
    ),
  }

  writeCustomApiStorage(nextStorage)
  process.env.DOGE_API_KEY = nextApiKey

  const normalizedKey = normalizeApiKeyForConfig(nextApiKey)
  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      apiKey: undefined,
    },
    customApiKeyResponses: {
      approved: [
        ...new Set([
          ...(current.customApiKeyResponses?.approved ?? []),
          normalizedKey,
        ]),
      ],
      rejected: (current.customApiKeyResponses?.rejected ?? []).filter(
        key => key !== normalizedKey,
      ),
    },
  }))

  context.onChangeAPIKey()

  return {
    type: 'text',
    value: profile
      ? `Saved API key for ${profile.id} (${profile.model})`
      : `Saved API key for active model ${targetId}`,
  }
}
