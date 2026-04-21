const DEFAULT_MAX_CHARS = 900
const DEFAULT_MAX_STATUS_LINES = 12
const DEFAULT_MAX_COMMIT_LINES = 3

function parseLabeledBlock(
  sections: string[],
  prefix: string,
): {
  index: number
  body: string
} | null {
  const index = sections.findIndex(section => section.startsWith(prefix))
  if (index === -1) {
    return null
  }

  return {
    index,
    body: sections[index]!.slice(prefix.length).trim(),
  }
}

export function summarizeGitStatusForAuxiliaryTask(
  gitStatus: string,
  options?: {
    maxChars?: number
    maxStatusLines?: number
    maxCommitLines?: number
  },
): string {
  const normalized = gitStatus.trim()
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS
  const maxStatusLines = options?.maxStatusLines ?? DEFAULT_MAX_STATUS_LINES
  const maxCommitLines = options?.maxCommitLines ?? DEFAULT_MAX_COMMIT_LINES

  if (normalized.length <= maxChars) {
    return normalized
  }

  const sections = normalized
    .split(/\n{2,}/)
    .map(section => section.trim())
    .filter(Boolean)

  const statusBlock = parseLabeledBlock(sections, 'Status:\n')
  const commitsBlock = parseLabeledBlock(sections, 'Recent commits:\n')

  const retainedSections = sections.filter(
    section =>
      !section.startsWith('Status:\n') && !section.startsWith('Recent commits:\n'),
  )

  if (statusBlock) {
    const statusLines = statusBlock.body
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    const keptStatusLines = statusLines.slice(0, maxStatusLines)
    const omittedStatusCount = Math.max(0, statusLines.length - keptStatusLines.length)
    retainedSections.push(
      [
        'Status:',
        ...keptStatusLines,
        ...(omittedStatusCount > 0
          ? [`... (${omittedStatusCount} more paths omitted)`]
          : []),
      ].join('\n'),
    )
  }

  if (commitsBlock) {
    const commitLines = commitsBlock.body
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    const keptCommitLines = commitLines.slice(0, maxCommitLines)
    const omittedCommitCount = Math.max(0, commitLines.length - keptCommitLines.length)
    retainedSections.push(
      [
        'Recent commits:',
        ...keptCommitLines,
        ...(omittedCommitCount > 0
          ? [`... (${omittedCommitCount} more commits omitted)`]
          : []),
      ].join('\n'),
    )
  }

  let summary = retainedSections.join('\n\n').trim()

  while (summary.length > maxChars && retainedSections.length > 0) {
    const lastSection = retainedSections[retainedSections.length - 1]
    if (lastSection?.startsWith('Recent commits:\n')) {
      retainedSections.pop()
    } else if (lastSection?.startsWith('Status:\n')) {
      const statusLines = lastSection.split(/\r?\n/)
      if (statusLines.length > 3) {
        statusLines.splice(statusLines.length - 1, 1)
        retainedSections[retainedSections.length - 1] = statusLines.join('\n')
      } else {
        retainedSections.pop()
      }
    } else {
      retainedSections.pop()
    }
    summary = retainedSections.join('\n\n').trim()
  }

  return summary.length < normalized.length ? summary : normalized
}
