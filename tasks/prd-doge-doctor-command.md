# PRD: Doge Doctor Command

## Introduction

Add a `doge doctor` diagnostics command that helps contributors quickly understand whether a local Doge Code installation is healthy on Windows. The command should inspect runtime prerequisites, configuration paths, and provider-related settings, then present the results in both human-readable and machine-readable forms.

## Goals

- Add a first-class diagnostics command to the CLI
- Surface Bun, Node, and config-path health in one place
- Make Windows setup issues easier to triage
- Provide JSON output for future automation

## User Stories

### US-001: Register the `doctor` command and shared report shape
**Description:** As a contributor, I want a real `doge doctor` entrypoint so diagnostics can be invoked consistently from the CLI.

**Acceptance Criteria:**
- [ ] A `doctor` command is registered in the CLI command system
- [ ] Running `doge doctor` reaches a dedicated handler module
- [ ] A shared report type is defined for doctor results
- [ ] `bun run version` still succeeds

### US-002: Collect runtime and filesystem diagnostics
**Description:** As a contributor, I want Doge Code to detect common runtime and path issues so I can fix environment problems quickly.

**Acceptance Criteria:**
- [ ] The doctor flow collects the current Bun version
- [ ] The doctor flow collects the current Node version
- [ ] The doctor flow checks whether the Doge config directory exists
- [ ] The doctor flow checks whether the main config file exists
- [ ] The doctor flow records status as pass, warn, or fail for each check
- [ ] `bun run version` still succeeds

### US-003: Render a human-readable doctor report
**Description:** As a contributor, I want a readable summary in the terminal so I can understand failures without opening source files.

**Acceptance Criteria:**
- [ ] `doge doctor` prints a clearly grouped terminal report
- [ ] Each check includes a label, status, and short explanation
- [ ] Warnings and failures are visually distinguishable in the output
- [ ] The command exits successfully when only warnings are present
- [ ] `bun run version` still succeeds

### US-004: Add JSON output mode and docs
**Description:** As a tooling author, I want `doge doctor --json` output so scripts can consume diagnostics automatically.

**Acceptance Criteria:**
- [ ] `doge doctor --json` prints valid JSON
- [ ] The JSON payload reuses the shared doctor report shape
- [ ] README or docs include a short usage example for `doge doctor`
- [ ] `bun run version` still succeeds

## Functional Requirements

- FR-1: The CLI must expose a `doctor` command
- FR-2: The command must collect runtime information for Bun and Node
- FR-3: The command must inspect the Doge config directory and primary config file
- FR-4: Each diagnostic result must include a status and explanation
- FR-5: The command must support both human-readable and JSON output

## Non-Goals

- No automatic repair actions in this first version
- No provider network requests during diagnosis
- No telemetry upload or remote reporting

## Technical Considerations

- Reuse existing CLI command registration patterns
- Keep checks fast and local
- Prefer utilities that already exist for path, config, and platform detection
- Preserve restored-tree conventions and avoid broad refactors

## Success Metrics

- A contributor can run one command to inspect setup health
- Common Windows misconfiguration issues become easier to explain
- JSON output is stable enough for future automation

## Open Questions

- Should warnings map to a non-zero exit code in CI mode later?
- Should provider config checks expand into endpoint and auth validation in a follow-up feature?
