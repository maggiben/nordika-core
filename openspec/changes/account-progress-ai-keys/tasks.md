## 1. Account persistence

- [x] 1.1 Extend account schema + DTOs for `openaiApiKey` / `anthropicApiKey` with PATCH omit/set/clear semantics
- [x] 1.2 Return configured flags on GET; never echo raw keys
- [x] 1.3 Unit tests for account settings get/update/clear

## 2. Parse path

- [x] 2.1 Resolve account vs env API key + model inside `ProgressParseService.parseReply`
- [x] 2.2 Pass account progress AI (including keys) from messaging reply handling
- [x] 2.3 Unit tests for account key preference and env fallback (OpenAI + Anthropic)

## 3. Validation

- [x] 3.1 Run lint, unit coverage, build, and `spec:validate` for this change
