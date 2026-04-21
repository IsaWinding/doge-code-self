export const OUTPUTS_SUBDIR = 'outputs'

// Match the Files API client's default parallelism so file persistence stays
// aligned with the upload worker pool used underneath.
export const DEFAULT_UPLOAD_CONCURRENCY = 5

// Guardrail for how many modified files a single turn is allowed to persist.
// This keeps accidental large workspace sweeps from turning into massive
// uploads during headless automation.
export const FILE_COUNT_LIMIT = 1000

export type PersistedFile = {
  filename: string
  file_id: string
}

export type FailedPersistence = {
  filename: string
  error: string
}

export type FilesPersistedEventData = {
  files: PersistedFile[]
  failed: FailedPersistence[]
}

export type TurnStartTime = number
