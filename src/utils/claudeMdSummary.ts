const DEFAULT_MAX_CHARS = 4000
const DEFAULT_SECTION_MAX_CHARS = 600
const MAX_LINE_CHARS = 160

const PRIORITY_LINE_PATTERNS = [
  /^#{1,6}\s/,
  /^[-*]\s/,
  /^\d+\.\s/,
  /\b(always|never|must|required|avoid|prefer|important)\b/i,
]

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

function truncateLine(line: string, maxChars = MAX_LINE_CHARS): string {
  if (line.length <= maxChars) {
    return line
  }
  return `${line.slice(0, maxChars - 3).trimEnd()}...`
}

function takeRepresentativeLines(
  lines: string[],
  maxChars: number,
  maxLines = 12,
): string[] {
  const selected: string[] = []
  const seen = new Set<string>()
  let usedChars = 0

  for (const line of lines) {
    const normalized = normalizeLine(line)
    if (normalized.length === 0) continue

    const dedupeKey = normalized.toLowerCase()
    if (seen.has(dedupeKey)) continue

    const candidate = truncateLine(normalized)
    const nextChars = usedChars + candidate.length + (selected.length > 0 ? 1 : 0)
    if (selected.length > 0 && nextChars > maxChars) {
      break
    }

    selected.push(candidate)
    seen.add(dedupeKey)
    usedChars = nextChars

    if (selected.length >= maxLines) {
      break
    }
  }

  return selected
}

function summarizeGenericText(text: string, maxChars: number): string {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  const priorityLines = lines.filter(line =>
    PRIORITY_LINE_PATTERNS.some(pattern => pattern.test(line)),
  )
  const selectedLines = takeRepresentativeLines(
    [...priorityLines, ...lines],
    maxChars,
  )

  return selectedLines.join('\n')
}

function summarizeSection(section: string, maxChars: number): string {
  const lines = section.split(/\r?\n/)
  const title = normalizeLine(lines[0] ?? '')
  const body = lines.slice(1).join('\n').trim()

  if (!body) {
    return title
  }

  const summaryBody = summarizeGenericText(
    body,
    Math.max(120, maxChars - title.length - 2),
  )

  if (!summaryBody) {
    return title
  }

  return `${title}\n${summaryBody}`
}

export function summarizeClaudeMdForAuxiliaryTask(
  claudeMd: string,
  options?: {
    maxChars?: number
    sectionMaxChars?: number
  },
): string {
  const normalized = claudeMd.trim()
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS
  const sectionMaxChars = options?.sectionMaxChars ?? DEFAULT_SECTION_MAX_CHARS

  if (normalized.length <= maxChars) {
    return normalized
  }

  const firstSectionIndex = normalized.indexOf('Contents of ')
  const summaryHeader =
    'Condensed project instructions for this auxiliary task. Keep the main coding loop as the source of truth for full CLAUDE/AGENTS guidance.'

  let summary = summaryHeader

  if (firstSectionIndex === -1) {
    const condensedBody = summarizeGenericText(
      normalized,
      Math.max(200, maxChars - summaryHeader.length - 2),
    )
    summary = `${summaryHeader}\n\n${condensedBody}`
    return summary.length < normalized.length
      ? summary.slice(0, maxChars).trimEnd()
      : normalized
  }

  const sections = normalized
    .slice(firstSectionIndex)
    .split(/\n{2,}(?=Contents of )/)
    .map(section => section.trim())
    .filter(Boolean)

  for (const section of sections) {
    const nextBlock = summarizeSection(section, sectionMaxChars)
    if (!nextBlock) continue

    const candidate =
      summary.length === 0 ? nextBlock : `${summary}\n\n${nextBlock}`

    if (candidate.length > maxChars) {
      break
    }

    summary = candidate
  }

  if (summary === summaryHeader) {
    const condensedBody = summarizeGenericText(
      normalized,
      Math.max(200, maxChars - summaryHeader.length - 2),
    )
    summary = `${summaryHeader}\n\n${condensedBody}`
  }

  const trimmedSummary = summary.slice(0, maxChars).trimEnd()
  return trimmedSummary.length < normalized.length ? trimmedSummary : normalized
}
