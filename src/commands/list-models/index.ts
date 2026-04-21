import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'list-models',
  description: 'List saved custom model profiles and show the active one',
  supportsNonInteractive: false,
  load: () => import('./list-models.js'),
} satisfies Command
