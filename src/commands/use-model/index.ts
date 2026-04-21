import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'use-model',
  description: 'Switch to a saved custom model profile or builtin preset',
  supportsNonInteractive: false,
  load: () => import('./use-model.js'),
} satisfies Command
