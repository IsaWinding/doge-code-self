import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'

type CommandBenchmark = {
  label: string
  meanMs: number
  medianMs: number
  minMs: number
  maxMs: number
}

type MicroBenchmark = {
  label: string
  ms: number
}

type BenchmarkReport = {
  generatedAt: string
  commandBenchmarks: CommandBenchmark[]
  microBenchmarks: MicroBenchmark[]
  sizeBenchmarks?: Array<{
    label: string
    beforeChars: number
    afterChars: number
  }>
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function formatDeltaPercent(previous: number, current: number): string {
  if (previous === 0) return 'n/a'
  const delta = ((current - previous) / previous) * 100
  const direction = delta <= 0 ? 'faster' : 'slower'
  return `${Math.abs(round(delta))}% ${direction}`
}

function formatDeltaMs(previous: number, current: number): string {
  const delta = round(current - previous)
  return delta === 0 ? '0ms' : `${delta > 0 ? '+' : ''}${delta}ms`
}

function formatCommandComparisons(
  previous: BenchmarkReport,
  current: BenchmarkReport,
): string[] {
  const currentMap = new Map(
    current.commandBenchmarks.map(benchmark => [benchmark.label, benchmark]),
  )

  return previous.commandBenchmarks.flatMap(previousBenchmark => {
    const currentBenchmark = currentMap.get(previousBenchmark.label)
    if (!currentBenchmark) {
      return [`- ${previousBenchmark.label}: missing in current report`]
    }

    return [
      `- ${previousBenchmark.label}: median ${previousBenchmark.medianMs}ms -> ${currentBenchmark.medianMs}ms (${formatDeltaMs(previousBenchmark.medianMs, currentBenchmark.medianMs)}, ${formatDeltaPercent(previousBenchmark.medianMs, currentBenchmark.medianMs)})`,
      `  mean ${previousBenchmark.meanMs}ms -> ${currentBenchmark.meanMs}ms`,
    ]
  })
}

function formatMicroComparisons(
  previous: BenchmarkReport,
  current: BenchmarkReport,
): string[] {
  const currentMap = new Map(
    current.microBenchmarks.map(benchmark => [benchmark.label, benchmark]),
  )

  return previous.microBenchmarks.flatMap(previousBenchmark => {
    const currentBenchmark = currentMap.get(previousBenchmark.label)
    if (!currentBenchmark) {
      return [`- ${previousBenchmark.label}: missing in current report`]
    }

    return [
      `- ${previousBenchmark.label}: ${previousBenchmark.ms}ms -> ${currentBenchmark.ms}ms (${formatDeltaMs(previousBenchmark.ms, currentBenchmark.ms)}, ${formatDeltaPercent(previousBenchmark.ms, currentBenchmark.ms)})`,
    ]
  })
}

function formatSizeComparisons(
  previous: BenchmarkReport,
  current: BenchmarkReport,
): string[] {
  const previousBenchmarks = previous.sizeBenchmarks ?? []
  const currentBenchmarks = current.sizeBenchmarks ?? []

  if (previousBenchmarks.length === 0 && currentBenchmarks.length === 0) {
    return []
  }

  const currentMap = new Map(
    currentBenchmarks.map(benchmark => [benchmark.label, benchmark]),
  )

  const lines = previousBenchmarks.flatMap(previousBenchmark => {
    const currentBenchmark = currentMap.get(previousBenchmark.label)
    if (!currentBenchmark) {
      return [`- ${previousBenchmark.label}: missing in current report`]
    }

    const previousReduction =
      previousBenchmark.beforeChars === 0
        ? 0
        : round(
            ((previousBenchmark.beforeChars - previousBenchmark.afterChars) /
              previousBenchmark.beforeChars) *
              100,
          )
    const currentReduction =
      currentBenchmark.beforeChars === 0
        ? 0
        : round(
            ((currentBenchmark.beforeChars - currentBenchmark.afterChars) /
              currentBenchmark.beforeChars) *
              100,
          )

    return [
      `- ${previousBenchmark.label}: ${previousBenchmark.beforeChars} -> ${previousBenchmark.afterChars} chars (${previousReduction}% smaller) | current ${currentBenchmark.beforeChars} -> ${currentBenchmark.afterChars} chars (${currentReduction}% smaller)`,
    ]
  })

  const previousLabels = new Set(previousBenchmarks.map(benchmark => benchmark.label))
  for (const currentBenchmark of currentBenchmarks) {
    if (previousLabels.has(currentBenchmark.label)) continue
    const currentReduction =
      currentBenchmark.beforeChars === 0
        ? 0
        : round(
            ((currentBenchmark.beforeChars - currentBenchmark.afterChars) /
              currentBenchmark.beforeChars) *
              100,
          )
    lines.push(
      `- ${currentBenchmark.label}: new benchmark in current report (${currentBenchmark.beforeChars} -> ${currentBenchmark.afterChars} chars, ${currentReduction}% smaller)`,
    )
  }

  return lines
}

function main(): void {
  const [, , previousPathArg, currentPathArg, outputPathArg] = process.argv

  if (!previousPathArg || !currentPathArg) {
    throw new Error(
      'Usage: bun run benchmark:compare <previous-report.json> <current-report.json> [output.md]',
    )
  }

  const previousPath = resolve(previousPathArg)
  const currentPath = resolve(currentPathArg)
  const previous = JSON.parse(
    readFileSync(previousPath, 'utf8'),
  ) as BenchmarkReport
  const current = JSON.parse(readFileSync(currentPath, 'utf8')) as BenchmarkReport

  const outputPath =
    outputPathArg
      ? resolve(outputPathArg)
      : join(
          process.cwd(),
          'tasks',
          'benchmarks',
          `compare-${basename(previousPath, '.json')}-vs-${basename(currentPath, '.json')}.md`,
        )

  mkdirSync(dirname(outputPath), { recursive: true })

  const content = [
    '# Benchmark Comparison',
    '',
    `Previous: ${previous.generatedAt}`,
    `Current: ${current.generatedAt}`,
    '',
    '## CLI',
    ...formatCommandComparisons(previous, current),
    '',
    '## Microbench',
    ...formatMicroComparisons(previous, current),
    '',
    '## Context Size',
    ...formatSizeComparisons(previous, current),
    '',
  ].join('\n')

  writeFileSync(outputPath, content)
  console.log(`Wrote benchmark comparison: ${outputPath}`)
}

main()
