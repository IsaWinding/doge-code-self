import { homedir } from 'os'
import { join } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { pathExists } from './file.js'

export type CheckStatus = 'pass' | 'warn' | 'fail'

export type DoctorCheck = {
  label: string
  status: CheckStatus
  detail: string
}

export async function collectDoctorChecks(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  // Check Bun version
  const bunVersion = process.versions.bun ?? null
  checks.push({
    label: 'Bun',
    status: bunVersion ? 'pass' : 'warn',
    detail: bunVersion ? `Bun ${bunVersion} detected` : 'Bun not detected (running on Node.js)',
  })

  // Check Node version
  const nodeVersion = process.version ?? null
  checks.push({
    label: 'Node',
    status: nodeVersion ? 'pass' : 'warn',
    detail: nodeVersion ? `Node ${nodeVersion} detected` : 'Node version not available',
  })

  // Check Doge config directory
  const configDir = getClaudeConfigHomeDir()
  const configDirExists = await pathExists(configDir)
  checks.push({
    label: 'Config directory',
    status: configDirExists ? 'pass' : 'warn',
    detail: configDirExists
      ? `${configDir} exists`
      : `${configDir} not found`,
  })

  // Check main config file (settings.json in config dir)
  const configFile = join(configDir, 'settings.json')
  const configFileExists = await pathExists(configFile)
  checks.push({
    label: 'Config file',
    status: configFileExists ? 'pass' : 'warn',
    detail: configFileExists
      ? `${configFile} found`
      : `${configFile} not found`,
  })

  return checks
}
