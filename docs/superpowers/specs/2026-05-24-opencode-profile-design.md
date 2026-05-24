# opencode-profile — Design Document

- **Date**: 2026-05-24
- **Status**: Approved (design phase complete, pending implementation plan)
- **Author**: Yusuke Ohi (with AI pair)
- **Target OpenCode version**: `>=1.14.0` (verified against the `packages/plugin` SDK exposing the `config` hook)

## 1. Background and Motivation

The user maintains a single OpenCode configuration (`~/.config/opencode/opencode.jsonc`) which is a symlink into a dotfiles repository. Switching between operating contexts — e.g., **work** vs. **private** — requires editing this base configuration by hand or maintaining branches in dotfiles. Both are error-prone.

This document specifies a **profile switching system** that overlays per-profile differences onto the base configuration **at OpenCode plugin load time, in-memory**, without ever touching the base files on disk.

## 2. Goals and Non-Goals

### Goals

- Allow the user to maintain multiple OpenCode configuration profiles (e.g., `work`, `private`).
- Switch the active profile via a CLI command and have it take effect on the next OpenCode launch.
- Preserve the base `opencode.jsonc` (and its symlink target in the dotfiles repository) unmodified.
- Preserve JSONC comments and formatting in profile overlay files when read.
- Provide diagnostics: list profiles, show current profile, dry-run diff.

### Non-Goals (YAGNI — explicitly out of scope)

- **Overlay of `oh-my-openagent.jsonc`**. That file is consumed by a separate plugin which reads it directly from disk; influencing its behavior requires changes inside that plugin and is out of scope here.
- **Backup mechanism** prior to switching. Spec explicitly requires direct application.
- **Hot reload / mid-session profile switch**. Restart is required after switch.
- **Composing multiple overlays per profile**. One profile equals one file.
- **Deletion semantics via overlay** (e.g., a `$delete` directive). Deferred until concrete need arises.

## 3. Architecture

### 3.1 Overview

```
[ User shell ]
   │
   │  $ opencode-profile switch work
   │  $ opencode
   │
   ▼
[ ~/.config/opencode/ ]
   ├── opencode.jsonc          (base, symlink OK, never modified)
   ├── profile.active          (state file containing the active profile name)
   └── profiles/
       ├── work.jsonc          (overlay)
       └── private.jsonc       (overlay)
                ▲
                │ reads only
                │
[ OpenCode process ]
   ├── Config.Service: loads opencode.jsonc → cfg (cached reference)
   └── Plugin: @yohi/opencode-profile
         └── config(cfg) hook:
               1. resolve active profile (env var → state file)
               2. parse profiles/<active>.jsonc via jsonc-parser
               3. deep-merge into cfg (in-place mutation)
```

Subsequent `Config.get()` calls inside OpenCode return the mutated `cfg` because `Config.Service` caches the reference (see `opencode/packages/opencode/src/config/config.ts:798-800`).

### 3.2 Responsibility Split

| Component | Role | Write authority |
|---|---|---|
| **CLI `opencode-profile`** | Manage active-profile state, scaffold and inspect overlays | `profile.active`; `profiles/*.jsonc` (init only) |
| **Plugin `@yohi/opencode-profile`** | Apply overlay at OpenCode boot | Read-only on disk; mutates the in-memory `cfg` object only |
| **Shared library `core/`** | Path resolution, JSONC parsing, deep-merge utility, active-profile resolution | None |

The plugin and CLI both depend on `core/` and are otherwise independent npm packages.

### 3.3 Lifecycle

1. **User** runs `opencode-profile switch work` → CLI writes `"work"` into `~/.config/opencode/profile.active`.
2. **User** runs `opencode`.
3. **OpenCode Config** loads `opencode.jsonc` and builds `cfg`.
4. **OpenCode Plugin Loader** loads `@yohi/opencode-profile` (declared in `opencode.jsonc` under the `plugin` key).
5. **Plugin `config(cfg)` hook**:
   - Resolves the active profile (env var `OPENCODE_PROFILE`, then state file).
   - If null → log info, return.
   - Reads `profiles/<active>.jsonc` via `jsonc-parser`.
   - Deep-merges the overlay into `cfg` in place.
6. **All subsequent consumers** of `Config.get()` receive the merged config.

### 3.4 Active-Profile Resolution

Priority order (first non-empty wins):

1. Environment variable `OPENCODE_PROFILE` (empty string ⇒ explicitly "no profile").
2. State file `~/.config/opencode/profile.active` (single line, trimmed).
3. `null` — no profile, plugin is a no-op.

## 4. Profile File Layout

```
~/.config/opencode/
├── opencode.jsonc                (base)
├── profile.active                (single-line state file, mode 0600)
└── profiles/
    ├── work.jsonc                (overlay)
    ├── private.jsonc             (overlay)
    └── …
```

- One profile equals one `.jsonc` file.
- The overlay's structure is a **subset** of the OpenCode Config schema. Only keys present in the overlay are merged.
- Profile names must match `^[a-zA-Z0-9_-]+$` (path-traversal protection).

## 5. Merge Semantics

### 5.1 General rules

- **Primitives** (string, number, boolean, null): overlay replaces base.
- **Objects**: recursive deep merge.
- **Arrays**: **replace by default** (overlay wholly replaces base).
- **Special case — `instructions` key**: arrays are concatenated with deduplication. This matches OpenCode's own merge behavior (`opencode/packages/opencode/src/config/config.ts:55-61`).

### 5.2 `MergeOptions`

```ts
interface MergeOptions {
  concatKeys: ReadonlySet<string>   // default: new Set(["instructions"])
}
```

The `concatKeys` set is extensible if future requirements demand additional concat-merged keys, but defaults match OpenCode's stock behavior.

### 5.3 Edge cases

| Case | Behavior |
|---|---|
| `null` in overlay | Treated as overwrite-with-null (not deletion) |
| Overlay key absent in base | Added |
| Type mismatch (e.g., object → primitive) | Overlay wins |
| Empty overlay file | Parsed as `{}` → no-op |

## 6. Component Detail

### 6.1 Monorepo Layout

```
opencode-profile/
├── .devcontainer/
│   ├── devcontainer.json
│   └── Dockerfile
├── package.json                  (root, npm workspaces)
├── tsconfig.base.json
└── packages/
    ├── core/
    │   ├── package.json          (@yohi/opencode-profile-core)
    │   ├── src/
    │   │   ├── paths.ts
    │   │   ├── state.ts
    │   │   ├── jsonc.ts
    │   │   ├── merge.ts
    │   │   ├── resolve.ts
    │   │   └── index.ts
    │   └── test/
    │       ├── merge.test.ts
    │       ├── jsonc.test.ts
    │       ├── resolve.test.ts
    │       ├── paths.test.ts
    │       └── state.test.ts
    │
    ├── plugin/
    │   ├── package.json          (@yohi/opencode-profile)
    │   ├── src/
    │   │   └── index.ts
    │   └── test/
    │       └── plugin.test.ts
    │
    └── cli/
        ├── package.json          (@yohi/opencode-profile-cli, bin: opencode-profile)
        ├── src/
        │   ├── index.ts
        │   ├── commands/
        │   │   ├── switch.ts
        │   │   ├── list.ts
        │   │   ├── current.ts
        │   │   ├── show.ts
        │   │   ├── diff.ts
        │   │   └── init.ts
        │   └── ui/
        │       └── feedback.ts
        └── test/
            └── cli.test.ts
```

### 6.2 `core/` API (signature level)

```ts
// paths.ts
export const paths = {
  configDir(): string                     // $XDG_CONFIG_HOME/opencode or ~/.config/opencode
  baseConfig(): string                    // <configDir>/opencode.jsonc
  stateFile(): string                     // <configDir>/profile.active
  profilesDir(): string                   // <configDir>/profiles
  profileFile(name: string): string       // <configDir>/profiles/<name>.jsonc; throws on invalid name
}

// state.ts
export function readActiveProfile(): string | null
export function writeActiveProfile(name: string | null): void      // atomic, 0600

// resolve.ts
export function resolveActiveProfile(env?: NodeJS.ProcessEnv): string | null

// jsonc.ts
export function parseJsonc(text: string, source: string): unknown  // throws with file+location on syntax error
export function readJsoncFile(path: string): unknown

// merge.ts
export interface MergeOptions {
  concatKeys: ReadonlySet<string>
}
export function deepMergeConfig<T extends object>(
  base: T, overlay: Partial<T>, options?: MergeOptions
): T                                        // returns a NEW object; base/overlay untouched
export function applyOverlayInPlace<T extends object>(
  target: T, overlay: Partial<T>, options?: MergeOptions
): void                                     // mutates target
```

### 6.3 Plugin Sketch

```ts
// packages/plugin/src/index.ts
import type { Plugin } from "@opencode-ai/plugin"
import {
  resolveActiveProfile, paths, readJsoncFile, applyOverlayInPlace,
} from "@yohi/opencode-profile-core"
import { existsSync } from "node:fs"

export const ProfilePlugin: Plugin = async () => ({
  async config(cfg) {
    const profile = resolveActiveProfile(process.env)
    if (!profile) {
      console.log("[opencode-profile] no active profile, skipping overlay")
      return
    }
    const file = paths.profileFile(profile)
    if (!existsSync(file)) {
      console.warn(`[opencode-profile] profile "${profile}" not found at ${file}`)
      return
    }
    try {
      const overlay = readJsoncFile(file) as Partial<typeof cfg>
      applyOverlayInPlace(cfg, overlay)
      console.log(`[opencode-profile] applied profile "${profile}"`)
    } catch (err) {
      console.error(`[opencode-profile] failed to apply profile "${profile}":`, err)
      // intentionally swallow — never block OpenCode boot
    }
  },
})

export default ProfilePlugin
```

### 6.4 CLI Surface

```
opencode-profile switch <name>            Set the active profile.
opencode-profile switch <name> --force    Set even if the overlay file does not exist.
opencode-profile switch --none            Clear the active profile (deletes profile.active).
opencode-profile list                     List available overlays under profiles/.
opencode-profile current                  Print the active profile and its source (env/state).
opencode-profile show <name>              Print the overlay file's parsed content.
opencode-profile diff <name>              Show effective diff between base and base+overlay.
opencode-profile init <name>              Create an empty overlay file scaffold.
```

Common flags:

- `--quiet`: suppress decorative TTY output.
- `--json`: emit machine-readable JSON (where applicable).

Exit codes: `0` success, `1` user error (e.g., non-existent profile), `2` internal error.

## 7. Data Flow and Edge Cases

### 7.1 `switch` data flow

```
[User]
   │ opencode-profile switch work
   ▼
[commander] parses argv
   ▼
[switch.ts]
   │ validate name shape (^[a-zA-Z0-9_-]+$)
   │ verify <profilesDir>/work.jsonc exists (override: --force)
   │ writeActiveProfile("work")  ← atomic: write .tmp + rename, 0600
   ▼
[feedback] print success + "restart OpenCode to apply"
```

### 7.2 OpenCode startup data flow

```
Config.Service.loadInstanceState() → cfg (cached reference)
PluginLoader loads @yohi/opencode-profile
plugin.config(cfg) fires:
   resolveActiveProfile(process.env)
   → if null: log info, return (no-op)
   → if profile file missing: warn, return (no-op)
   → parseJsonc → applyOverlayInPlace(cfg, overlay)
Subsequent Config.get() returns the mutated cfg
```

### 7.3 Edge Cases

| Case | Behavior | Rationale |
|---|---|---|
| `profile.active` missing | Treated as "no profile". No warning. | Normal initial state. |
| `OPENCODE_PROFILE=""` | Treated as "no profile". | Explicit override to default. |
| Profile file missing | Warn, no-op. | Don't block boot. |
| Profile file has JSONC syntax error | Error log with file + position, no-op. | Don't block boot. |
| Empty profile file | Parsed as `{}` → no-op. | Normal. |
| Schema mismatch in overlay | Delegated to OpenCode's own schema validation. | Plugin's responsibility ends at merging. |
| Invalid profile name (`..`, `/`) | CLI rejects with non-zero exit. | Path-traversal protection. |
| `profiles/` directory missing | `list` returns empty; `switch` fails with a hint to `init`. | Explicit error. |
| Concurrent OpenCode instances + `switch` | Warn that running instances need restart; do not attempt process detection. | Overengineering avoided. |
| Crash during state write | Atomic rename mitigates partial-file risk. | Standard safety pattern. |
| "Clear" active profile | `switch --none` removes `profile.active`. | Explicit clear path. |

### 7.4 Security and Safety

- **Path traversal**: profile names are validated against `^[a-zA-Z0-9_-]+$`.
- **State file permissions**: `profile.active` written with mode `0600`.
- **Symlinks**: Base config and overlay files may be symlinks. All operations are read-only on these files; mutation is purely in-memory.
- **Secrets**: Overlay files should not contain plaintext secrets. OpenCode's existing `$VAR` and `{file:...}` substitution mechanisms remain available and are encouraged in overlays.

### 7.5 Logging

- **Plugin**: at most one informational `console.log` per boot, optional warn/error lines on misconfiguration.
- **CLI**: colored TTY output by default (via `picocolors`); `--quiet` suppresses; `--json` emits structured output for scripting.

## 8. Test Strategy

### 8.1 Three layers

- **Layer 1 — Core unit tests** (most numerous): `merge`, `jsonc`, `resolve`, `paths`, `state`.
- **Layer 2 — Plugin integration tests**: directly invoke the `config` hook with a mock `cfg`; assert mutations propagate to the same reference.
- **Layer 3 — CLI E2E smoke tests**: spawn the built binary via `execa` against a temporary `HOME`.

### 8.2 Core test coverage targets

- `merge.test.ts`: primitive overwrite, nested objects, default-replace arrays, concat for `instructions`, null handling, type mismatch, immutability of `deepMergeConfig`, mutation of `applyOverlayInPlace`.
- `jsonc.test.ts`: line and block comments, trailing commas, empty input → `{}`, syntax error reporting with source location.
- `resolve.test.ts`: env-var priority, empty env-var ⇒ null, state-file fallback, trimming of trailing newline.
- `paths.test.ts`: `$XDG_CONFIG_HOME` priority, `$HOME` fallback, rejection of invalid profile names.
- `state.test.ts`: atomic write, 0600 mode, `null` ⇒ file removal.

### 8.3 Plugin integration tests

- Skip mutation if no profile resolves.
- No-op if profile file missing.
- Successful overlay mutates the original `cfg` reference.
- JSONC syntax errors do not throw out of the hook.
- `instructions` concatenation observed end-to-end.
- `plugin` array replacement observed end-to-end.

### 8.4 CLI E2E coverage

- `list` on empty state exits 0.
- `init` scaffolds an empty overlay file.
- `switch` updates the state file and prints a restart hint.
- `switch <missing>` exits non-zero.
- `current` prints the source (`env` or `state`).
- `switch --none` removes the state file.
- Invalid profile names rejected with non-zero exit.

### 8.5 Tooling

- **Linter**: `oxlint` (matches OpenCode upstream).
- **Formatter**: `prettier`.
- **Type checker**: `tsc -b` (composite project references).
- **Test runner**: `vitest`.
- **CI script (`npm run ci`)**: `format:check && lint && typecheck && test`.

### 8.6 Coverage targets

- `core/`: ≥ 90% lines.
- `plugin/`: ≥ 70% lines (boundary conditions; merge logic is delegated).
- `cli/`: ≥ 60% lines (routing-heavy; supplemented by E2E).

### 8.7 TDD order

1. `core/merge.ts` (test → impl)
2. `core/jsonc.ts`
3. `core/paths.ts`, `state.ts`, `resolve.ts`
4. `plugin/index.ts` (integration)
5. `cli/commands/*`
6. CLI E2E smoke

## 9. Devcontainer and Build

### 9.1 Devcontainer

- **Base image**: `mcr.microsoft.com/devcontainers/typescript-node:24-bookworm` (Node 24, TypeScript, git pre-installed).
- **Additional tools**: Bun 1.3.14 (for parity with OpenCode upstream), cached `oxlint` and `prettier`.
- **User**: `node` (devcontainer standard non-root).
- **VS Code extensions**: oxlint LSP, prettier, vitest explorer, yaml.
- **postCreateCommand**: `npm install`.
- **Env**: `OPENCODE_PROFILE_TEST_HOME` set for test isolation (read by `paths.ts` only when present, gated to test builds).

### 9.2 Workspace `package.json` (root)

```jsonc
{
  "name": "opencode-profile",
  "private": true,
  "type": "module",
  "workspaces": ["packages/core", "packages/plugin", "packages/cli"],
  "scripts": {
    "lint": "oxlint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b",
    "build": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "ci": "npm run format:check && npm run lint && npm run typecheck && npm run test"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^24.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "prettier": "^3.3.0",
    "oxlint": "^0.10.0",
    "execa": "^9.0.0"
  }
}
```

### 9.3 Package manifests

- `@yohi/opencode-profile-core`: depends on `jsonc-parser`, `remeda`.
- `@yohi/opencode-profile`: depends on `@yohi/opencode-profile-core`; peer-depends `@opencode-ai/plugin >=1.14.0`.
- `@yohi/opencode-profile-cli`: depends on `@yohi/opencode-profile-core`, `commander`, `picocolors`; declares `bin.opencode-profile = dist/index.js`.

### 9.4 TypeScript

- `tsconfig.base.json`: `target ES2022`, `module NodeNext`, `moduleResolution NodeNext`, `strict`, `noUncheckedIndexedAccess`, `declaration`, `declarationMap`.
- Each package: `extends ../../tsconfig.base.json`, `composite: true`, project references.

### 9.5 Distribution

| Package | Distribution | Install |
|---|---|---|
| `@yohi/opencode-profile-core` | npm (internal use, may be private) | (transitive) |
| `@yohi/opencode-profile` | npm | Add `"@yohi/opencode-profile@<ver>"` to `opencode.jsonc` `plugin` array |
| `@yohi/opencode-profile-cli` | npm | `npm install -g @yohi/opencode-profile-cli` |

## 10. References

- OpenCode plugin SDK: `opencode/packages/plugin/src/index.ts:222-333` (Hooks interface, `config` hook at line 224).
- OpenCode plugin loader and hook invocation: `opencode/packages/opencode/src/plugin/index.ts:136-245`.
- OpenCode Config service (`get()` returns cached reference): `opencode/packages/opencode/src/config/config.ts:798-800`.
- OpenCode internal merge behavior (`instructions` concat): `opencode/packages/opencode/src/config/config.ts:55-61`.
- OpenCode JSONC patching with `jsonc-parser.modify`: `opencode/packages/opencode/src/config/config.ts:349`.

## 11. Open Questions / Future Work

- **Overlay of `oh-my-openagent.jsonc`**: Requires a separate effort, likely a contribution to `oh-my-openagent` itself to make it profile-aware.
- **In-session switching**: Not supported. Would require an OpenCode API to re-trigger `config` hooks or replace the cached `cfg`.
- **`$delete` directive**: Deferred until a concrete need emerges.
- **Schema validation of overlays**: Currently delegated to OpenCode's own validation. Future enhancement could pre-validate overlays at CLI level.
