import {
  buildAuxiliarySystemContext,
  buildAuxiliaryUserContext,
} from '../../context.js'
import { asSystemPrompt, type SystemPrompt } from '../../utils/systemPromptType.js'
import { buildSessionMemorySystemPrompt } from './prompts.js'

export function buildSessionMemoryContextBundle({
  userContext,
  systemContext,
}: {
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
}): {
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
} {
  return {
    systemPrompt: asSystemPrompt([buildSessionMemorySystemPrompt()]),
    userContext: buildAuxiliaryUserContext(userContext, {
      maxClaudeMdChars: 2200,
      claudeMdSectionChars: 360,
    }),
    systemContext: buildAuxiliarySystemContext(systemContext, {
      maxGitStatusChars: 700,
      maxGitStatusLines: 8,
      maxCommitLines: 2,
    }),
  }
}
