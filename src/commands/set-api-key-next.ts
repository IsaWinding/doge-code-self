import type { Command } from '../commands.js'

export default {
  type: 'local',
  name: 'set-api-key',
  description: 'Save an API key for the active or named compatible model profile',
  supportsNonInteractive: false,
  load: () => import('./set-api-key-impl.js'),
} satisfies Command
