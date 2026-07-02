# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MCP server (stdio transport) that gives Claude Desktop read/write access to macOS Contacts. Distributed as an `.mcpb` bundle. Runtime is macOS-only, but the test suite fully mocks the native layer, so tests and the TypeScript build run on any platform.

## Commands

```bash
npm install            # install dependencies (macOS only — see note below)
npm run build          # tsc → compiles src/ to server/, chmods server/index.js
npm run dev            # tsc --watch
npm test               # vitest run (all tests)
npm run test:watch     # vitest watch mode
npx vitest run src/utils.test.ts       # run a single test file
npx vitest run -t "pattern"            # run tests matching a name pattern
npm run pack           # build + mcpb pack → connector-contacts-<version>.mcpb (requires: npm install -g @anthropic-ai/mcpb)
npm run clean          # remove server/ and *.mcpb artifacts
```

There is no linter configured. TypeScript strict mode is the only static check (`npm run build`).

**Non-macOS environments:** plain `npm install` fails because `node-mac-contacts` declares `os: darwin`. Use `npm install --force --ignore-scripts` instead — the build and the full test suite then work normally (tests mock the native module). Don't commit the resulting `package-lock.json` changes.

## Architecture

The server uses a **hybrid backend** — two parallel paths to macOS Contacts:

- **`src/contacts-native.ts`** — wraps the `node-mac-contacts` native addon. Handles contact CRUD and authorization. Every operation calls `ensureAccess()` first, which handles the macOS TCC permission flow (Not Determined → prompt, Denied → throw with instructions).
- **`src/contacts-applescript.ts`** — runs AppleScript via `osascript` for operations the native module doesn't support: group management and vCard export. These functions are **synchronous** (`execFileSync`).

**`src/index.ts`** is the single place where all 14 MCP tools are registered (Zod schemas, descriptions, `readOnlyHint`/`destructiveHint` annotations). Every tool handler is wrapped in `toolHandler()` from `src/utils.ts`, which returns `toolResult(data)` for whatever the handler returns and `toolError(err)` for anything it throws. The Zod field schemas shared by `create_contact`/`update_contact` live in `src/schemas.ts` and are also imported by the input-validation tests.

### Load-order and error-handling invariants

These are deliberate and easy to break — preserve them:

1. **`import "./setup-handlers.js"` must stay the first import in `index.ts`** so global `uncaughtException`/`unhandledRejection` handlers are installed before anything else runs.
2. **The native addon is lazy-loaded** (`loadNative()` in `contacts-native.ts`), not imported at top level. A top-level import would delay or kill the process before the MCP handshake completes, making addon failures unreportable through the protocol. The cached load promise resets on failure so `npm rebuild node-mac-contacts` + retry works.
3. **All logging goes to `console.error` (stderr)** — stdout is the MCP transport and must stay clean.
4. **Error messages are sanitized** via `sanitizeErrorMessage()` (strips filesystem paths) before reaching MCP clients.
5. **AppleScript strings embed user input only through `escapeAS()`**, and `osascript` is always invoked with `execFileSync` + array args (no shell). Any new AppleScript function must do both.

### Other non-obvious behaviors

- `searchContacts` falls back to a manual case-insensitive scan of all contacts when the native name-predicate search returns nothing (Unicode/tokenization quirks in Apple's API).
- `getContactDetails` has no "get by id" native API to use; it resolves identifier → name → targeted search, falling back to a full scan.
- `update_contact` merges the caller's fields with the current contact via `mergeContactUpdate()` in `contacts-native.ts`, which **omits** empty/undefined keys — the native module's validation rejects payloads containing keys with empty values, so don't "simplify" this into a plain spread.

## Testing conventions

Tests live next to sources (`src/*.test.ts`) and are excluded from the build via `tsconfig.json`. Vitest is configured with `mockReset: true`. The native module and `child_process` are mocked with `vi.mock()` at the top of each test file (before imports), so no macOS APIs are touched. Dedicated suites cover input validation (`input-validation.test.ts`) and error sanitization (`error-sanitization.test.ts`).

## Version and release

The version string appears in **three places that must stay in sync**: `package.json`, `manifest.json`, and the `McpServer` constructor in `src/index.ts`. CI (`.github/workflows/build.yml`) fails a tag build if the tag doesn't match `package.json`.

Releases: pushing to `main` publishes a `latest` prerelease bundle; pushing a `v*.*.*` tag publishes a semver release. CI runs tests on `macos-latest`.

Adding or renaming an MCP tool requires updating both the registration in `src/index.ts` and the `tools` array in `manifest.json` (what Claude Desktop displays).
