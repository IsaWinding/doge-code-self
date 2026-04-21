import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'add-model',
  description: 'Add a custom model or apply a saved provider preset',
  supportsNonInteractive: false,
  load: () => import('./add-model.js'),
} satisfies Command
