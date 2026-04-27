# Changelog

## 2026-04-27

- Fixed compatible API preset lookup when multiple providers expose the same model name.
- Preferred exact preset/profile ids before model aliases, while keeping unique aliases convenient.
- Added ambiguity prompts for `/add-model --preset`, `/use-model`, `/set-api-key`, and `/remove-model`.
- Updated `/remove-model` to accept profile ids and avoid removing the wrong provider profile for duplicate model names.
- Preserved provider-specific API keys when switching, updating, or removing compatible API profiles.
- Added focused Bun tests for duplicate model aliases and active endpoint preference.

Validation:

- `bun run test:compatible-api`
- `bun run version`
