import type { LocalCommandCall } from '../../types/command.js'
import { readCustomApiStorage } from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async () => {
  const storage = readCustomApiStorage()
  const activeModel = storage.model
  const profiles = storage.savedProfiles ?? []

  if (profiles.length === 0) {
    return {
      type: 'text',
      value:
        'No saved custom model profiles yet.\n' +
        'Use /add-model --preset <id> or /add-model <model-name> first.',
    }
  }

  const lines = profiles.map(profile => {
    const isActive = profile.model === activeModel
    const keyStatus = profile.apiKey ? 'key:saved' : 'key:missing'
    return (
      `${isActive ? '* ' : '- '}${profile.id} -> ${profile.model} ` +
      `(${profile.provider}, ${keyStatus}) @ ${profile.baseURL}`
    )
  })

  return {
    type: 'text',
    value:
      'Saved custom model profiles:\n' +
      lines.join('\n') +
      '\n\nUse /use-model <id> to switch.',
  }
}
