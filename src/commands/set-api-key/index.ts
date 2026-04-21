import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'set-api-key',
  description: 'Save an API key for the current custom model or a named saved model',
  supportsNonInteractive: false,
  isSensitive: true,
  load: () => import('./set-api-key.js'),
} satisfies Command
