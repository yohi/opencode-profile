# opencode-profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All tests, lint, typecheck, and the branch-validation poka-yoke MUST execute inside the Devcontainer once Phase 0 lands.**

**Goal:** Build an OpenCode plugin + companion CLI (`opencode-profile`) that overlays per-profile differences (work / private / …) onto the base `opencode.jsonc` in memory at plugin load time, without touching the base file on disk.

**Architecture:** npm-workspaces monorepo with three packages — `core` (path/state/jsonc/merge utilities), `plugin` (`@opencode-ai/plugin` `config` hook that mutates the cached `cfg` reference), and `cli` (`commander`-based `opencode-profile` command). Active profile is resolved from `OPENCODE_PROFILE` env var → `~/.config/opencode/profile.active` state file → null.

**Tech Stack:** TypeScript (`strict`, `noUncheckedIndexedAccess`, `module: NodeNext`, `target: ES2022`), Node 24, npm workspaces, `vitest`, `oxlint`, `prettier`, `jsonc-parser`, `commander`, `picocolors`, `execa` (E2E only). Build/lint/test run inside a Devcontainer (`mcr.microsoft.com/devcontainers/typescript-node:24-bookworm`).

**Source spec:** `docs/superpowers/specs/2026-05-24-opencode-profile-design.md`

---

## Git Workflow Strategy (AI-Native Stacked PRs)

This plan follows the **AI-Native Stacked PR Workflow**: <https://different-sunday-448.notion.site/AI-Native-Stacked-PR-Workflow-3611669a4c16802eb032eb4ab05a8adb>.

### Conventions

- **Trunk branch:** `main` (the repo's existing trunk). The spec phrase "master branch" is interpreted as the trunk. If you rename `main` → `master`, adjust the values of `EXPECTED_BASE` and the CI trigger accordingly.
- **Branch naming:** `<area>/<short-slug>` — e.g. `setup/foundation`, `core/merge`, `plugin/main`, `cli/switch`.
- **One task = one branch = one Draft PR**, targeting its parent branch (NOT trunk) when stacked.
- **No direct commits or pushes to `main`.** No PR merges by the agent — merging is reserved for human reviewers.
- **Draft PR URLs are passed forward** as the *prerequisite* for the next stacked task.

### Branch dependency chain (parent → child)

```
main
 └─ setup/foundation                (Task 0.1)
     └─ setup/ci                    (Task 0.2)
         └─ core/merge              (Task 1.1)
             └─ core/jsonc          (Task 1.2)
                 └─ core/paths      (Task 1.3)
                     └─ core/state  (Task 1.4)
                         └─ core/resolve     (Task 1.5)
                             └─ core/barrel  (Task 1.6)
                                 └─ plugin/main      (Task 2.1)
                                     └─ cli/scaffold (Task 3.1)
                                         └─ cli/switch  (Task 3.2)
                                             └─ cli/list    (Task 3.3)
                                                 └─ cli/current (Task 3.4)
                                                     └─ cli/show    (Task 3.5)
                                                         └─ cli/diff    (Task 3.6)
                                                             └─ cli/init    (Task 3.7)
                                                                 └─ cli/e2e (Task 3.8)
                                                                     └─ release/readme (Task 4.1)
```

### Required poka-yoke at the start of every task (Step 1)

**Every task MUST run this validation script inside the Devcontainer before any code change.** It physically blocks the agent from working on the wrong base branch.

```bash
# Run inside the Devcontainer.
set -euo pipefail
EXPECTED_BASE="<task-specific value — copy verbatim from the task header>"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "Current branch: ${CURRENT_BRANCH}"
echo "Expected base : ${EXPECTED_BASE}"
git fetch origin "${EXPECTED_BASE}":"refs/remotes/origin/${EXPECTED_BASE}" 2>/dev/null || true
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

If this check fails, **abort the task and reset the branch** rather than working around it.

### Draft PR creation at the end of every task

Every task ends with:

```bash
git push -u origin "<this-task's-branch>"
gh pr create --draft \
  --base "<parent-branch>" \
  --head "<this-task's-branch>" \
  --title "<Conventional Commit style title>" \
  --body "Implements <task id> from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <parent Draft PR URL or 'n/a (targets main)'>"
```

Record the returned Draft PR URL — it is the prerequisite for the next stacked task.

### Parallel execution rules (per task header)

- **直列必須 (Stacked):** Derives from a previous task's branch. **MUST NOT start until the parent task's Draft PR URL exists.**
- **並列可能 (Independent):** Derives from a Phase Base AND touches files not modified by any sibling task.

In this plan, almost every task is **直列必須** because each consumes the previous task's exports or registrations. Parallelism is called out explicitly where it is safe.

---

## File Structure (decomposition lock-in)

Created by phase. Each file has a single responsibility; the boundaries are deliberate so that each task ships a self-contained, reviewable change.

```
opencode-profile/
├── .devcontainer/
│   ├── devcontainer.json              # Task 0.1
│   └── Dockerfile                     # Task 0.1
├── bitbucket-pipelines.yml            # Task 0.2
├── package.json                       # Task 0.1 (workspaces root, scripts)
├── tsconfig.base.json                 # Task 0.1
├── vitest.workspace.ts                # Task 0.1
├── .prettierrc.json                   # Task 0.1
├── .prettierignore                    # Task 0.1
├── .oxlintrc.json                     # Task 0.1
├── .gitignore                         # Task 0.1
├── README.md                          # Task 4.1
└── packages/
    ├── core/
    │   ├── package.json               # Task 0.1 (stub) → Task 1.x (deps)
    │   ├── tsconfig.json              # Task 0.1
    │   ├── vitest.config.ts           # Task 0.1
    │   ├── src/
    │   │   ├── merge.ts               # Task 1.1
    │   │   ├── jsonc.ts               # Task 1.2
    │   │   ├── paths.ts               # Task 1.3
    │   │   ├── state.ts               # Task 1.4
    │   │   ├── resolve.ts             # Task 1.5
    │   │   └── index.ts               # Task 0.1 (empty) → Task 1.6 (barrel)
    │   └── test/
    │       ├── merge.test.ts          # Task 1.1
    │       ├── jsonc.test.ts          # Task 1.2
    │       ├── paths.test.ts          # Task 1.3
    │       ├── state.test.ts          # Task 1.4
    │       └── resolve.test.ts        # Task 1.5
    ├── plugin/
    │   ├── package.json               # Task 0.1 (stub) → Task 2.1
    │   ├── tsconfig.json              # Task 0.1
    │   ├── vitest.config.ts           # Task 0.1
    │   ├── src/index.ts               # Task 0.1 (empty) → Task 2.1
    │   └── test/plugin.test.ts        # Task 2.1
    └── cli/
        ├── package.json               # Task 0.1 (stub) → Task 3.1
        ├── tsconfig.json              # Task 0.1
        ├── vitest.config.ts           # Task 0.1
        ├── src/
        │   ├── index.ts               # Task 0.1 (empty) → Task 3.1+
        │   ├── commands/
        │   │   ├── switch.ts          # Task 3.2
        │   │   ├── list.ts            # Task 3.3
        │   │   ├── current.ts         # Task 3.4
        │   │   ├── show.ts            # Task 3.5
        │   │   ├── diff.ts            # Task 3.6
        │   │   └── init.ts            # Task 3.7
        │   └── ui/feedback.ts         # Task 3.1
        └── test/
            └── e2e.test.ts            # Task 3.8
```

---

## Phase 0 — Foundation

### Task 0.1: Devcontainer & monorepo skeleton

- **派生元ブランチ**: `main`
- **実行モード**: 並列可能 (no other task derives from `main`)
- **前提条件**: なし
- **Branch to create**: `setup/foundation`

**Files:**
- Create: `.devcontainer/devcontainer.json`
- Create: `.devcontainer/Dockerfile`
- Create: `.gitignore`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.oxlintrc.json`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/plugin/package.json`
- Create: `packages/plugin/tsconfig.json`
- Create: `packages/plugin/vitest.config.ts`
- Create: `packages/plugin/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/src/index.ts`

- [x] **Step 1: Branch creation and base validation**

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b setup/foundation

# Poka-yoke (note: Devcontainer is not yet built; for THIS task only, the script
# is run on the host since the devcontainer image is being created here).
set -euo pipefail
EXPECTED_BASE="main"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [x] **Step 2: Write `.devcontainer/Dockerfile`**

```dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# Bun (1.3.14) for parity with OpenCode upstream tooling.
ARG BUN_VERSION=1.3.14
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun || true

# GitHub CLI for `gh pr create`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

USER node
```

- [x] **Step 3: Write `.devcontainer/devcontainer.json`**

```jsonc
{
  "name": "opencode-profile",
  "build": { "dockerfile": "Dockerfile" },
  "remoteUser": "node",
  "postCreateCommand": "npm install",
  "containerEnv": {
    "OPENCODE_PROFILE_TEST_HOME": "/tmp/opencode-profile-test-home"
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "oxc.oxc-vscode",
        "esbenp.prettier-vscode",
        "vitest.explorer",
        "redhat.vscode-yaml"
      ]
    }
  }
}
```

- [x] **Step 4: Write `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.DS_Store
.env
.env.*
!.env.example
```

- [x] **Step 5: Write `.prettierrc.json` and `.prettierignore`**

`.prettierrc.json`:
```json
{
  "semi": false,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`:
```
node_modules
dist
coverage
*.tsbuildinfo
```

- [x] **Step 6: Write `.oxlintrc.json`**

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "rules": {
    "no-console": "off"
  },
  "ignorePatterns": ["dist", "coverage", "node_modules"]
}
```

- [x] **Step 7: Write root `package.json`**

```jsonc
{
  "name": "opencode-profile",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
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

- [x] **Step 8: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true,
    "verbatimModuleSyntax": true
  }
}
```

- [x] **Step 9: Write `vitest.workspace.ts`**

```ts
export default [
  "packages/core",
  "packages/plugin",
  "packages/cli",
]
```

- [x] **Step 10: Create `packages/core` stubs**

`packages/core/package.json`:
```jsonc
{
  "name": "@yohi/opencode-profile-core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {}
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "test"]
}
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
})
```

`packages/core/src/index.ts`:
```ts
export {}
```

- [x] **Step 11: Create `packages/plugin` stubs**

`packages/plugin/package.json`:
```jsonc
{
  "name": "@yohi/opencode-profile",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {
    "@yohi/opencode-profile-core": "0.0.0"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": ">=1.14.0"
  }
}
```

`packages/plugin/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [{ "path": "../core" }],
  "include": ["src/**/*"],
  "exclude": ["dist", "test"]
}
```

`packages/plugin/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
})
```

`packages/plugin/src/index.ts`:
```ts
export {}
```

- [x] **Step 12: Create `packages/cli` stubs**

`packages/cli/package.json`:
```jsonc
{
  "name": "@yohi/opencode-profile-cli",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "opencode-profile": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {
    "@yohi/opencode-profile-core": "0.0.0"
  }
}
```

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [{ "path": "../core" }],
  "include": ["src/**/*"],
  "exclude": ["dist", "test"]
}
```

`packages/cli/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
})
```

`packages/cli/src/index.ts`:
```ts
#!/usr/bin/env node
export {}
```

- [x] **Step 13: Open the Devcontainer and verify the toolchain**

From VS Code: "Dev Containers: Reopen in Container". Then **inside the Devcontainer terminal**:

```bash
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: `npm install` succeeds, `tsc -b` produces no errors, `oxlint` and `prettier --check` report 0 issues, and `vitest run` reports `No test files found` (exit 0) or runs 0 tests.

- [x] **Step 14: Commit**

```bash
git add .devcontainer .gitignore .prettierrc.json .prettierignore .oxlintrc.json \
        package.json tsconfig.base.json vitest.workspace.ts packages
git commit -m "chore(setup): scaffold monorepo, devcontainer, and package stubs"
```

- [x] **Step 15: Push and open Draft PR**

```bash
git push -u origin setup/foundation
gh pr create --draft \
  --base main \
  --head setup/foundation \
  --title "chore(setup): scaffold monorepo, devcontainer, and package stubs" \
  --body "Implements Task 0.1 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: n/a (targets main)."
```

Record the printed Draft PR URL as **PR_0_1_URL**: https://github.com/yohi/opencode-profile/pull/2

---

### Task 0.2: CI pipeline (Bitbucket Pipelines)

- **派生元ブランチ**: `setup/foundation`
- **実行モード**: 直列必須 (Wait for Task 0.1)
- **前提条件**: `PR_0_1_URL` (Task 0.1 のDraft PR) が存在すること
- **Branch to create**: `setup/ci`

**Files:**
- Create: `bitbucket-pipelines.yml`

- [x] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout setup/foundation
git pull --ff-only origin setup/foundation
git checkout -b setup/ci

set -euo pipefail
EXPECTED_BASE="setup/foundation"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [x] **Step 2: Write `bitbucket-pipelines.yml`**

The spec calls for "ubuntu-slim" runner. Bitbucket Pipelines exposes runner selection via `runs-on`; the closest portable equivalent for the runtime image is the `node:24-bookworm-slim` Debian-slim image (Debian = Ubuntu's upstream), which includes Node 24 and matches the Devcontainer's `bookworm` baseline.

```yaml
image: node:24-bookworm-slim

definitions:
  caches:
    npm: node_modules

pipelines:
  branches:
    main:
      - step:
          name: CI (lint, typecheck, test)
          runs-on:
            - self.hosted
            - linux.shell
            - ubuntu-slim
          caches: [npm]
          script:
            - npm ci
            - npm run ci
  pull-requests:
    "**":
      - step:
          name: CI (lint, typecheck, test)
          runs-on:
            - self.hosted
            - linux.shell
            - ubuntu-slim
          caches: [npm]
          script:
            - npm ci
            - npm run ci
```

> Note: If your Bitbucket workspace does not have a self-hosted `ubuntu-slim` runner, remove the `runs-on` block to fall back to the default Atlassian-hosted runner; the `image: node:24-bookworm-slim` keeps the toolchain consistent.

- [x] **Step 3: Validate YAML inside the Devcontainer**

```bash
node -e "const y = require('js-yaml'); y.load(require('fs').readFileSync('bitbucket-pipelines.yml','utf8')); console.log('YAML OK')" \
  || python3 -c "import yaml,sys; yaml.safe_load(open('bitbucket-pipelines.yml')); print('YAML OK')"
```

Expected: `YAML OK`. (Both paths are provided since the Devcontainer ships Python by default; install `js-yaml` only if needed.)

- [x] **Step 4: Commit, push, open Draft PR**

```bash
git add bitbucket-pipelines.yml
git commit -m "ci: add Bitbucket Pipelines targeting main with ubuntu-slim runner"
git push -u origin setup/ci
gh pr create --draft \
  --base setup/foundation \
  --head setup/ci \
  --title "ci: add Bitbucket Pipelines targeting main with ubuntu-slim runner" \
  --body "Implements Task 0.2 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_0_1_URL>."
```

Record the Draft PR URL as **PR_0_2_URL**: https://github.com/yohi/opencode-profile/pull/3

---

## Phase 1 — Core utilities (TDD)

All Phase 1 tasks run **inside the Devcontainer**. TDD order matches design §8.7.

### Task 1.1: `core/merge.ts` (deep merge with `instructions` concat)

- **派生元ブランチ**: `setup/ci`
- **実行モード**: 直列必須 (Wait for Task 0.2)
- **前提条件**: `PR_0_2_URL` (Task 0.2 のDraft PR) が存在すること
- **Branch to create**: `core/merge`

**Files:**
- Create: `packages/core/src/merge.ts`
- Create: `packages/core/test/merge.test.ts`

- [x] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout setup/ci
git pull --ff-only origin setup/ci
git checkout -b core/merge

set -euo pipefail
EXPECTED_BASE="setup/ci"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [x] **Step 2: Write the failing tests**

`packages/core/test/merge.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { deepMergeConfig, applyOverlayInPlace } from "../src/merge.js"

describe("deepMergeConfig", () => {
  it("returns a new object and does not mutate inputs", () => {
    const base = { a: 1 }
    const overlay = { a: 2 }
    const result = deepMergeConfig(base, overlay)
    expect(result).not.toBe(base)
    expect(base).toEqual({ a: 1 })
    expect(overlay).toEqual({ a: 2 })
  })

  it("overwrites primitives with the overlay value", () => {
    expect(deepMergeConfig({ a: 1, b: "x" }, { a: 2 })).toEqual({ a: 2, b: "x" })
  })

  it("deep-merges nested objects", () => {
    expect(deepMergeConfig({ a: { b: 1, c: 2 } }, { a: { c: 9, d: 3 } }))
      .toEqual({ a: { b: 1, c: 9, d: 3 } })
  })

  it("replaces arrays by default", () => {
    expect(deepMergeConfig({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] })
  })

  it("concatenates and deduplicates arrays for `instructions`", () => {
    expect(deepMergeConfig({ instructions: ["a", "b"] }, { instructions: ["b", "c"] }))
      .toEqual({ instructions: ["a", "b", "c"] })
  })

  it("supports extending concatKeys via MergeOptions", () => {
    const result = deepMergeConfig(
      { tags: ["x"] },
      { tags: ["x", "y"] },
      { concatKeys: new Set(["tags"]) },
    )
    expect(result).toEqual({ tags: ["x", "y"] })
  })

  it("treats null in overlay as overwrite-with-null (not deletion)", () => {
    expect(deepMergeConfig({ a: 1 }, { a: null } as unknown as Partial<{ a: number }>))
      .toEqual({ a: null })
  })

  it("adds overlay keys absent in base", () => {
    expect(deepMergeConfig({} as Record<string, unknown>, { a: 1 })).toEqual({ a: 1 })
  })

  it("lets overlay win on type mismatch", () => {
    const base: Record<string, unknown> = { a: { x: 1 } }
    expect(deepMergeConfig(base, { a: "str" })).toEqual({ a: "str" })
  })

  it("handles empty overlay as a no-op", () => {
    expect(deepMergeConfig({ a: 1, b: 2 }, {})).toEqual({ a: 1, b: 2 })
  })
})

describe("applyOverlayInPlace", () => {
  it("mutates the target in place and preserves its reference identity", () => {
    const target = { a: 1, nested: { x: 1 } }
    const ref = target
    applyOverlayInPlace(target, { a: 2, nested: { y: 2 } })
    expect(target).toBe(ref)
    expect(target).toEqual({ a: 2, nested: { x: 1, y: 2 } })
  })

  it("concatenates `instructions` end-to-end on the original reference", () => {
    const target: { instructions: string[] } = { instructions: ["a"] }
    applyOverlayInPlace(target, { instructions: ["a", "b"] })
    expect(target.instructions).toEqual(["a", "b"])
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

```bash
cd /workspaces/opencode-profile  # or repo root inside container
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: FAIL — `Cannot find module '../src/merge.js'` or similar.

- [x] **Step 4: Implement `packages/core/src/merge.ts`**

```ts
export interface MergeOptions {
  concatKeys: ReadonlySet<string>
}

const DEFAULT_OPTIONS: MergeOptions = {
  concatKeys: new Set(["instructions"]),
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  options: MergeOptions,
): void {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (
      options.concatKeys.has(key) &&
      Array.isArray(targetValue) &&
      Array.isArray(sourceValue)
    ) {
      const merged: unknown[] = [...targetValue]
      for (const item of sourceValue) {
        if (!merged.includes(item)) merged.push(item)
      }
      target[key] = merged
      continue
    }

    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergeInto(targetValue, sourceValue, options)
      continue
    }

    target[key] = sourceValue
  }
}

export function deepMergeConfig<T extends object>(
  base: T,
  overlay: Partial<T>,
  options: MergeOptions = DEFAULT_OPTIONS,
): T {
  const clone = structuredClone(base) as T
  mergeInto(clone as Record<string, unknown>, overlay as Record<string, unknown>, options)
  return clone
}

export function applyOverlayInPlace<T extends object>(
  target: T,
  overlay: Partial<T>,
  options: MergeOptions = DEFAULT_OPTIONS,
): void {
  mergeInto(target as Record<string, unknown>, overlay as Record<string, unknown>, options)
}
```

- [x] **Step 5: Run tests to verify they pass**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: PASS (12+ assertions).

- [x] **Step 6: Typecheck and lint**

```bash
npm run typecheck
npm run lint
npm run format:check
```

Expected: 0 errors on all three.

- [x] **Step 7: Commit, push, open Draft PR**

```bash
git add packages/core/src/merge.ts packages/core/test/merge.test.ts
git commit -m "feat(core): add deepMergeConfig and applyOverlayInPlace with instructions concat"
git push -u origin core/merge
gh pr create --draft \
  --base setup/ci \
  --head core/merge \
  --title "feat(core): add deepMergeConfig and applyOverlayInPlace with instructions concat" \
  --body "Implements Task 1.1 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_0_2_URL>."
```

Record the URL as **PR_1_1_URL**: https://github.com/yohi/opencode-profile/pull/4

---

### Task 1.2: `core/jsonc.ts` (JSONC parsing with location-aware errors)

- **派生元ブランチ**: `core/merge`
- **実行モード**: 直列必須 (Wait for Task 1.1)
- **前提条件**: `PR_1_1_URL` が存在すること
- **Branch to create**: `core/jsonc`

**Files:**
- Modify: `packages/core/package.json` (add `jsonc-parser` dependency)
- Create: `packages/core/src/jsonc.ts`
- Create: `packages/core/test/jsonc.test.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout core/merge
git pull --ff-only origin core/merge
git checkout -b core/jsonc

set -euo pipefail
EXPECTED_BASE="core/merge"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Add `jsonc-parser` dependency**

```bash
npm install jsonc-parser@^3.3.0 -w @yohi/opencode-profile-core
```

- [ ] **Step 3: Write the failing tests**

`packages/core/test/jsonc.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { parseJsonc, readJsoncFile } from "../src/jsonc.js"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("parseJsonc", () => {
  it("parses standard JSON", () => {
    expect(parseJsonc('{"a":1}', "<inline>")).toEqual({ a: 1 })
  })

  it("strips line and block comments", () => {
    const text = `{
      // line comment
      "a": 1, /* block comment */
      "b": 2
    }`
    expect(parseJsonc(text, "<inline>")).toEqual({ a: 1, b: 2 })
  })

  it("tolerates trailing commas", () => {
    expect(parseJsonc('{"a":1,}', "<inline>")).toEqual({ a: 1 })
  })

  it("returns {} for an empty input", () => {
    expect(parseJsonc("", "<inline>")).toEqual({})
    expect(parseJsonc("   \n\t", "<inline>")).toEqual({})
  })

  it("throws with file path and offset on syntax error", () => {
    expect(() => parseJsonc('{"a":}', "config.jsonc"))
      .toThrow(/config\.jsonc/)
  })
})

describe("readJsoncFile", () => {
  it("reads and parses a JSONC file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencode-profile-jsonc-"))
    try {
      const path = join(dir, "x.jsonc")
      writeFileSync(path, '{ /* hi */ "a": 1, }', "utf8")
      expect(readJsoncFile(path)).toEqual({ a: 1 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: FAIL on `jsonc.test.ts`; `merge.test.ts` still passes.

- [ ] **Step 5: Implement `packages/core/src/jsonc.ts`**

```ts
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser"
import { readFileSync } from "node:fs"

function formatErrors(errors: ParseError[], source: string, text: string): string {
  const lines = errors.map((e) => {
    const upto = text.slice(0, e.offset)
    const line = upto.split("\n").length
    const col = upto.length - upto.lastIndexOf("\n")
    return `${source}:${line}:${col}: ${printParseErrorCode(e.error)} (length ${e.length})`
  })
  return `JSONC parse error(s):\n  ${lines.join("\n  ")}`
}

export function parseJsonc(text: string, source: string): unknown {
  if (text.trim() === "") return {}
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0) throw new Error(formatErrors(errors, source, text))
  return value ?? {}
}

export function readJsoncFile(path: string): unknown {
  const text = readFileSync(path, "utf8")
  return parseJsonc(text, path)
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: PASS for both `merge.test.ts` and `jsonc.test.ts`.

- [ ] **Step 7: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors on all three.

- [ ] **Step 8: Commit, push, Draft PR**

```bash
git add packages/core/package.json package-lock.json \
        packages/core/src/jsonc.ts packages/core/test/jsonc.test.ts
git commit -m "feat(core): add parseJsonc and readJsoncFile with location-aware errors"
git push -u origin core/jsonc
gh pr create --draft \
  --base core/merge \
  --head core/jsonc \
  --title "feat(core): add parseJsonc and readJsoncFile with location-aware errors" \
  --body "Implements Task 1.2 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_1_1_URL>."
```

Record as **PR_1_2_URL**.

---

### Task 1.3: `core/paths.ts` (XDG-aware path resolution + name validation)

- **派生元ブランチ**: `core/jsonc`
- **実行モード**: 直列必須 (Wait for Task 1.2)
- **前提条件**: `PR_1_2_URL` が存在すること
- **Branch to create**: `core/paths`

**Files:**
- Create: `packages/core/src/paths.ts`
- Create: `packages/core/test/paths.test.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout core/jsonc
git pull --ff-only origin core/jsonc
git checkout -b core/paths

set -euo pipefail
EXPECTED_BASE="core/jsonc"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/paths.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { paths, isValidProfileName } from "../src/paths.js"
import { homedir } from "node:os"
import { join } from "node:path"

const originalEnv = { ...process.env }

beforeEach(() => {
  delete process.env.XDG_CONFIG_HOME
  delete process.env.OPENCODE_PROFILE_TEST_HOME
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe("paths.configDir", () => {
  it("prefers $OPENCODE_PROFILE_TEST_HOME when set (test isolation)", () => {
    process.env.OPENCODE_PROFILE_TEST_HOME = "/tmp/iso"
    expect(paths.configDir()).toBe("/tmp/iso/opencode")
  })

  it("uses $XDG_CONFIG_HOME when set", () => {
    process.env.XDG_CONFIG_HOME = "/x/cfg"
    expect(paths.configDir()).toBe("/x/cfg/opencode")
  })

  it("falls back to ~/.config/opencode", () => {
    expect(paths.configDir()).toBe(join(homedir(), ".config", "opencode"))
  })
})

describe("paths.* derived paths", () => {
  beforeEach(() => { process.env.OPENCODE_PROFILE_TEST_HOME = "/tmp/iso" })

  it("baseConfig() returns <configDir>/opencode.jsonc", () => {
    expect(paths.baseConfig()).toBe("/tmp/iso/opencode/opencode.jsonc")
  })
  it("stateFile() returns <configDir>/profile.active", () => {
    expect(paths.stateFile()).toBe("/tmp/iso/opencode/profile.active")
  })
  it("profilesDir() returns <configDir>/profiles", () => {
    expect(paths.profilesDir()).toBe("/tmp/iso/opencode/profiles")
  })
  it("profileFile(name) returns <profilesDir>/<name>.jsonc", () => {
    expect(paths.profileFile("work")).toBe("/tmp/iso/opencode/profiles/work.jsonc")
  })
  it("profileFile(name) throws on invalid names", () => {
    for (const bad of ["..", "/", "a/b", "a b", "", ".hidden", "a.b"]) {
      expect(() => paths.profileFile(bad)).toThrow(/invalid profile name/i)
    }
  })
})

describe("isValidProfileName", () => {
  it.each(["work", "private", "a", "A_1", "name-with-dash", "0123"])
    ("accepts %s", (n) => { expect(isValidProfileName(n)).toBe(true) })

  it.each(["", " ", "..", "a/b", "a.b", "a b", ".hidden"])
    ("rejects %s", (n) => { expect(isValidProfileName(n)).toBe(false) })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: FAIL on `paths.test.ts`.

- [ ] **Step 4: Implement `packages/core/src/paths.ts`**

```ts
import { homedir } from "node:os"
import { join } from "node:path"

const PROFILE_NAME_RE = /^[a-zA-Z0-9_-]+$/

export function isValidProfileName(name: string): boolean {
  return PROFILE_NAME_RE.test(name)
}

function resolveConfigDir(): string {
  const testHome = process.env.OPENCODE_PROFILE_TEST_HOME
  if (testHome && testHome.length > 0) return join(testHome, "opencode")
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg && xdg.length > 0) return join(xdg, "opencode")
  return join(homedir(), ".config", "opencode")
}

export const paths = {
  configDir(): string {
    return resolveConfigDir()
  },
  baseConfig(): string {
    return join(resolveConfigDir(), "opencode.jsonc")
  },
  stateFile(): string {
    return join(resolveConfigDir(), "profile.active")
  },
  profilesDir(): string {
    return join(resolveConfigDir(), "profiles")
  },
  profileFile(name: string): string {
    if (!isValidProfileName(name)) {
      throw new Error(`invalid profile name: ${JSON.stringify(name)}`)
    }
    return join(resolveConfigDir(), "profiles", `${name}.jsonc`)
  },
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: PASS for `merge`, `jsonc`, and `paths` test files.

- [ ] **Step 6: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors on all three.

- [ ] **Step 7: Commit, push, Draft PR**

```bash
git add packages/core/src/paths.ts packages/core/test/paths.test.ts
git commit -m "feat(core): add XDG-aware paths and profile name validation"
git push -u origin core/paths
gh pr create --draft \
  --base core/jsonc \
  --head core/paths \
  --title "feat(core): add XDG-aware paths and profile name validation" \
  --body "Implements Task 1.3 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_1_2_URL>."
```

Record as **PR_1_3_URL**.

---

### Task 1.4: `core/state.ts` (atomic state-file read/write)

- **派生元ブランチ**: `core/paths`
- **実行モード**: 直列必須 (Wait for Task 1.3)
- **前提条件**: `PR_1_3_URL` が存在すること
- **Branch to create**: `core/state`

**Files:**
- Create: `packages/core/src/state.ts`
- Create: `packages/core/test/state.test.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout core/paths
git pull --ff-only origin core/paths
git checkout -b core/state

set -euo pipefail
EXPECTED_BASE="core/paths"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/state.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { readActiveProfile, writeActiveProfile } from "../src/state.js"
import { paths } from "../src/paths.js"
import { mkdtempSync, rmSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "opencode-profile-state-"))
  process.env.OPENCODE_PROFILE_TEST_HOME = tmp
  mkdirSync(paths.configDir(), { recursive: true })
})

afterEach(() => {
  delete process.env.OPENCODE_PROFILE_TEST_HOME
  rmSync(tmp, { recursive: true, force: true })
})

describe("readActiveProfile", () => {
  it("returns null when the state file is missing", () => {
    expect(readActiveProfile()).toBeNull()
  })

  it("reads and trims the active profile name", () => {
    writeFileSync(paths.stateFile(), "work\n", "utf8")
    expect(readActiveProfile()).toBe("work")
  })

  it("returns null for an empty state file", () => {
    writeFileSync(paths.stateFile(), "   \n", "utf8")
    expect(readActiveProfile()).toBeNull()
  })
})

describe("writeActiveProfile", () => {
  it("creates the state file atomically with mode 0600", () => {
    writeActiveProfile("work")
    expect(readActiveProfile()).toBe("work")
    const mode = statSync(paths.stateFile()).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it("overwrites an existing state file", () => {
    writeActiveProfile("work")
    writeActiveProfile("private")
    expect(readActiveProfile()).toBe("private")
  })

  it("removes the state file when name is null", () => {
    writeActiveProfile("work")
    writeActiveProfile(null)
    expect(existsSync(paths.stateFile())).toBe(false)
    expect(readActiveProfile()).toBeNull()
  })

  it("rejects invalid profile names", () => {
    expect(() => writeActiveProfile("a/b")).toThrow(/invalid profile name/i)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: FAIL on `state.test.ts`.

- [ ] **Step 4: Implement `packages/core/src/state.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { isValidProfileName, paths } from "./paths.js"

export function readActiveProfile(): string | null {
  const file = paths.stateFile()
  if (!existsSync(file)) return null
  const text = readFileSync(file, "utf8").trim()
  return text.length === 0 ? null : text
}

export function writeActiveProfile(name: string | null): void {
  const file = paths.stateFile()
  if (name === null) {
    if (existsSync(file)) unlinkSync(file)
    return
  }
  if (!isValidProfileName(name)) {
    throw new Error(`invalid profile name: ${JSON.stringify(name)}`)
  }
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${name}\n`, { encoding: "utf8", mode: 0o600 })
  renameSync(tmp, file)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: PASS for all core tests so far.

- [ ] **Step 6: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors on all three.

- [ ] **Step 7: Commit, push, Draft PR**

```bash
git add packages/core/src/state.ts packages/core/test/state.test.ts
git commit -m "feat(core): add atomic readActiveProfile and writeActiveProfile (mode 0600)"
git push -u origin core/state
gh pr create --draft \
  --base core/paths \
  --head core/state \
  --title "feat(core): add atomic readActiveProfile and writeActiveProfile (mode 0600)" \
  --body "Implements Task 1.4 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_1_3_URL>."
```

Record as **PR_1_4_URL**.

---

### Task 1.5: `core/resolve.ts` (env-var → state-file → null priority)

- **派生元ブランチ**: `core/state`
- **実行モード**: 直列必須 (Wait for Task 1.4)
- **前提条件**: `PR_1_4_URL` が存在すること
- **Branch to create**: `core/resolve`

**Files:**
- Create: `packages/core/src/resolve.ts`
- Create: `packages/core/test/resolve.test.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout core/state
git pull --ff-only origin core/state
git checkout -b core/resolve

set -euo pipefail
EXPECTED_BASE="core/state"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/resolve.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolveActiveProfile } from "../src/resolve.js"
import { writeActiveProfile } from "../src/state.js"
import { paths } from "../src/paths.js"
import { mkdtempSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "opencode-profile-resolve-"))
  process.env.OPENCODE_PROFILE_TEST_HOME = tmp
  mkdirSync(paths.configDir(), { recursive: true })
})

afterEach(() => {
  delete process.env.OPENCODE_PROFILE_TEST_HOME
  rmSync(tmp, { recursive: true, force: true })
})

describe("resolveActiveProfile", () => {
  it("returns env var value when set", () => {
    expect(resolveActiveProfile({ OPENCODE_PROFILE: "work" })).toBe("work")
  })

  it("returns null when env var is the empty string (explicit clear)", () => {
    writeActiveProfile("work")
    expect(resolveActiveProfile({ OPENCODE_PROFILE: "" })).toBeNull()
  })

  it("falls back to the state file when env var is unset", () => {
    writeActiveProfile("private")
    expect(resolveActiveProfile({})).toBe("private")
  })

  it("returns null when neither env nor state file is set", () => {
    expect(resolveActiveProfile({})).toBeNull()
  })

  it("trims whitespace around env var values", () => {
    expect(resolveActiveProfile({ OPENCODE_PROFILE: "  work  " })).toBe("work")
  })

  it("returns null when env var is whitespace-only", () => {
    writeActiveProfile("private")
    expect(resolveActiveProfile({ OPENCODE_PROFILE: "   " })).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: FAIL on `resolve.test.ts`.

- [ ] **Step 4: Implement `packages/core/src/resolve.ts`**

```ts
import { readActiveProfile } from "./state.js"

export function resolveActiveProfile(env: NodeJS.ProcessEnv = process.env): string | null {
  const fromEnv = env.OPENCODE_PROFILE
  if (fromEnv !== undefined) {
    const trimmed = fromEnv.trim()
    return trimmed.length === 0 ? null : trimmed
  }
  return readActiveProfile()
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -w @yohi/opencode-profile-core -- --run --reporter=basic
```

Expected: PASS for all five core test files.

- [ ] **Step 6: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors on all three.

- [ ] **Step 7: Commit, push, Draft PR**

```bash
git add packages/core/src/resolve.ts packages/core/test/resolve.test.ts
git commit -m "feat(core): add resolveActiveProfile (env > state > null)"
git push -u origin core/resolve
gh pr create --draft \
  --base core/state \
  --head core/resolve \
  --title "feat(core): add resolveActiveProfile (env > state > null)" \
  --body "Implements Task 1.5 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_1_4_URL>."
```

Record as **PR_1_5_URL**.

---

### Task 1.6: `core/index.ts` barrel + coverage threshold

- **派生元ブランチ**: `core/resolve`
- **実行モード**: 直列必須 (Wait for Task 1.5)
- **前提条件**: `PR_1_5_URL` が存在すること
- **Branch to create**: `core/barrel`

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/vitest.config.ts` (enable coverage threshold)

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout core/resolve
git pull --ff-only origin core/resolve
git checkout -b core/barrel

set -euo pipefail
EXPECTED_BASE="core/resolve"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/core/src/index.ts` barrel**

```ts
export { deepMergeConfig, applyOverlayInPlace } from "./merge.js"
export type { MergeOptions } from "./merge.js"
export { parseJsonc, readJsoncFile } from "./jsonc.js"
export { paths, isValidProfileName } from "./paths.js"
export { readActiveProfile, writeActiveProfile } from "./state.js"
export { resolveActiveProfile } from "./resolve.js"
```

- [ ] **Step 3: Enforce the 90% line-coverage target for `core`**

Update `packages/core/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
})
```

- [ ] **Step 4: Run coverage to verify the threshold passes**

```bash
npm run test:coverage -w @yohi/opencode-profile-core
```

Expected: PASS; coverage report shows ≥90% lines for `packages/core/src`.

- [ ] **Step 5: Typecheck, lint, format, full test**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: 0 errors; all core tests pass.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/core/src/index.ts packages/core/vitest.config.ts
git commit -m "feat(core): export public API barrel and enforce 90% coverage"
git push -u origin core/barrel
gh pr create --draft \
  --base core/resolve \
  --head core/barrel \
  --title "feat(core): export public API barrel and enforce 90% coverage" \
  --body "Implements Task 1.6 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_1_5_URL>."
```

Record as **PR_1_6_URL**.

---

## Phase 2 — Plugin

### Task 2.1: `plugin/index.ts` (`config` hook applies overlay)

- **派生元ブランチ**: `core/barrel`
- **実行モード**: 直列必須 (Wait for Task 1.6)
- **前提条件**: `PR_1_6_URL` が存在すること
- **Branch to create**: `plugin/main`

**Files:**
- Modify: `packages/plugin/package.json` (add `@opencode-ai/plugin` as devDependency for typings used in tests)
- Modify: `packages/plugin/src/index.ts`
- Create: `packages/plugin/test/plugin.test.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout core/barrel
git pull --ff-only origin core/barrel
git checkout -b plugin/main

set -euo pipefail
EXPECTED_BASE="core/barrel"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Add `@opencode-ai/plugin` typings (devDependency)**

```bash
npm install -w @yohi/opencode-profile --save-dev "@opencode-ai/plugin@>=1.14.0"
```

> If the package version is unavailable, pin to the latest published 1.x or use `npm install -w @yohi/opencode-profile --save-dev @opencode-ai/plugin@latest` and document the resolved version in the PR body.

- [ ] **Step 3: Write the failing integration tests**

`packages/plugin/test/plugin.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { paths, writeActiveProfile } from "@yohi/opencode-profile-core"
import ProfilePlugin from "../src/index.js"

let tmp: string
let logs: string[] = []

function captureConsole(): void {
  logs = []
  vi.spyOn(console, "log").mockImplementation((...args) => { logs.push("log: " + args.join(" ")) })
  vi.spyOn(console, "warn").mockImplementation((...args) => { logs.push("warn: " + args.join(" ")) })
  vi.spyOn(console, "error").mockImplementation((...args) => { logs.push("error: " + args.join(" ")) })
}

async function runConfigHook(cfg: Record<string, unknown>): Promise<void> {
  const instance = await (ProfilePlugin as unknown as (ctx: object) => Promise<{ config: (c: object) => Promise<void> | void }>)({})
  await instance.config(cfg)
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "opencode-profile-plugin-"))
  process.env.OPENCODE_PROFILE_TEST_HOME = tmp
  delete process.env.OPENCODE_PROFILE
  mkdirSync(paths.profilesDir(), { recursive: true })
  captureConsole()
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.OPENCODE_PROFILE_TEST_HOME
  delete process.env.OPENCODE_PROFILE
  rmSync(tmp, { recursive: true, force: true })
})

describe("ProfilePlugin.config", () => {
  it("is a no-op when no profile resolves", async () => {
    const cfg = { instructions: ["base"] }
    await runConfigHook(cfg)
    expect(cfg).toEqual({ instructions: ["base"] })
    expect(logs.some((l) => l.includes("no active profile"))).toBe(true)
  })

  it("warns and no-ops when the profile file is missing", async () => {
    writeActiveProfile("ghost")
    const cfg = { instructions: ["base"] }
    await runConfigHook(cfg)
    expect(cfg).toEqual({ instructions: ["base"] })
    expect(logs.some((l) => l.startsWith("warn:") && l.includes("ghost"))).toBe(true)
  })

  it("mutates the original cfg reference when overlay applies", async () => {
    writeActiveProfile("work")
    writeFileSync(
      paths.profileFile("work"),
      '{ "model": "claude-opus-4-7", "instructions": ["work-extra"] }',
      "utf8",
    )
    const cfg: { model?: string; instructions?: string[] } = { instructions: ["base"] }
    const ref = cfg
    await runConfigHook(cfg)
    expect(cfg).toBe(ref) // reference preserved
    expect(cfg.model).toBe("claude-opus-4-7")
    expect(cfg.instructions).toEqual(["base", "work-extra"])
  })

  it("replaces arrays other than `instructions`", async () => {
    writeActiveProfile("work")
    writeFileSync(paths.profileFile("work"), '{ "plugin": ["@x/p"] }', "utf8")
    const cfg: { plugin?: string[] } = { plugin: ["@y/p"] }
    await runConfigHook(cfg)
    expect(cfg.plugin).toEqual(["@x/p"])
  })

  it("does not throw on JSONC syntax errors; logs an error", async () => {
    writeActiveProfile("work")
    writeFileSync(paths.profileFile("work"), '{ "a": }', "utf8")
    const cfg = { foo: 1 }
    await expect(runConfigHook(cfg)).resolves.toBeUndefined()
    expect(cfg).toEqual({ foo: 1 })
    expect(logs.some((l) => l.startsWith("error:"))).toBe(true)
  })

  it("honors the OPENCODE_PROFILE env var over the state file", async () => {
    writeActiveProfile("private")
    writeFileSync(paths.profileFile("work"), '{ "model": "from-work" }', "utf8")
    process.env.OPENCODE_PROFILE = "work"
    const cfg: { model?: string } = {}
    await runConfigHook(cfg)
    expect(cfg.model).toBe("from-work")
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npm test -w @yohi/opencode-profile -- --run --reporter=basic
```

Expected: FAIL — plugin entry point exports `{}` only.

- [ ] **Step 5: Implement `packages/plugin/src/index.ts`**

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { existsSync } from "node:fs"
import {
  applyOverlayInPlace,
  paths,
  readJsoncFile,
  resolveActiveProfile,
} from "@yohi/opencode-profile-core"

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
      applyOverlayInPlace(cfg as object, overlay as object)
      console.log(`[opencode-profile] applied profile "${profile}"`)
    } catch (err) {
      console.error(
        `[opencode-profile] failed to apply profile "${profile}":`,
        err instanceof Error ? err.message : err,
      )
      // intentionally swallow — never block OpenCode boot
    }
  },
})

export default ProfilePlugin
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -w @yohi/opencode-profile -- --run --reporter=basic
```

Expected: PASS for all 6 plugin tests; core tests remain green.

- [ ] **Step 7: Coverage threshold for plugin (≥70%)**

Update `packages/plugin/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 60 },
    },
  },
})
```

Run:
```bash
npm run test:coverage -w @yohi/opencode-profile
```

Expected: PASS.

- [ ] **Step 8: Typecheck, lint, format, full test**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: 0 errors.

- [ ] **Step 9: Commit, push, Draft PR**

```bash
git add packages/plugin/package.json package-lock.json \
        packages/plugin/src/index.ts packages/plugin/test/plugin.test.ts \
        packages/plugin/vitest.config.ts
git commit -m "feat(plugin): apply overlay to cfg in config hook; never block boot"
git push -u origin plugin/main
gh pr create --draft \
  --base core/barrel \
  --head plugin/main \
  --title "feat(plugin): apply overlay to cfg in config hook; never block boot" \
  --body "Implements Task 2.1 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_1_6_URL>."
```

Record as **PR_2_1_URL**.

---

## Phase 3 — CLI

### Task 3.1: CLI scaffold (commander, picocolors, feedback UI)

- **派生元ブランチ**: `plugin/main`
- **実行モード**: 直列必須 (Wait for Task 2.1)
- **前提条件**: `PR_2_1_URL` が存在すること
- **Branch to create**: `cli/scaffold`

**Files:**
- Modify: `packages/cli/package.json` (add `commander`, `picocolors`)
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/ui/feedback.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout plugin/main
git pull --ff-only origin plugin/main
git checkout -b cli/scaffold

set -euo pipefail
EXPECTED_BASE="plugin/main"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Install CLI dependencies**

```bash
npm install -w @yohi/opencode-profile-cli commander@^12.0.0 picocolors@^1.0.0
```

- [ ] **Step 3: Write `packages/cli/src/ui/feedback.ts`**

```ts
import pc from "picocolors"

export interface UIOptions {
  quiet?: boolean
  json?: boolean
}

export function info(msg: string, opts: UIOptions = {}): void {
  if (opts.quiet || opts.json) return
  console.log(pc.cyan("ℹ"), msg)
}

export function ok(msg: string, opts: UIOptions = {}): void {
  if (opts.quiet || opts.json) return
  console.log(pc.green("✓"), msg)
}

export function warn(msg: string, opts: UIOptions = {}): void {
  if (opts.json) return
  console.warn(pc.yellow("!"), msg)
}

export function fail(msg: string, opts: UIOptions = {}): void {
  if (opts.json) {
    console.error(JSON.stringify({ error: msg }))
  } else {
    console.error(pc.red("✗"), msg)
  }
}

export function emitJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2))
}
```

- [ ] **Step 4: Write `packages/cli/src/index.ts`**

```ts
#!/usr/bin/env node
import { Command } from "commander"

const program = new Command()
  .name("opencode-profile")
  .description("Manage OpenCode configuration profiles (overlay on opencode.jsonc)")
  .version("0.0.0")
  .option("--quiet", "Suppress decorative output")
  .option("--json", "Emit machine-readable JSON where applicable")

// Subcommands are registered in subsequent tasks.

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(2)
})
```

- [ ] **Step 5: Smoke-test the scaffold inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
node packages/cli/dist/index.js --help
```

Expected: usage banner showing program name, description, and global flags; exit 0.

- [ ] **Step 6: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 7: Commit, push, Draft PR**

```bash
git add packages/cli/package.json package-lock.json \
        packages/cli/src/index.ts packages/cli/src/ui/feedback.ts
git commit -m "feat(cli): scaffold opencode-profile commander program with quiet/json flags"
git push -u origin cli/scaffold
gh pr create --draft \
  --base plugin/main \
  --head cli/scaffold \
  --title "feat(cli): scaffold opencode-profile commander program with quiet/json flags" \
  --body "Implements Task 3.1 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_2_1_URL>."
```

Record as **PR_3_1_URL**.

---

### Task 3.2: `switch` command (sets active profile, atomic write)

- **派生元ブランチ**: `cli/scaffold`
- **実行モード**: 直列必須 (Wait for Task 3.1)
- **前提条件**: `PR_3_1_URL` が存在すること
- **Branch to create**: `cli/switch`

**Files:**
- Create: `packages/cli/src/commands/switch.ts`
- Modify: `packages/cli/src/index.ts` (register `switch`)

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/scaffold
git pull --ff-only origin cli/scaffold
git checkout -b cli/switch

set -euo pipefail
EXPECTED_BASE="cli/scaffold"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/src/commands/switch.ts`**

```ts
import { existsSync } from "node:fs"
import {
  isValidProfileName,
  paths,
  writeActiveProfile,
} from "@yohi/opencode-profile-core"
import { fail, ok, type UIOptions } from "../ui/feedback.js"

export interface SwitchOptions extends UIOptions {
  none?: boolean
  force?: boolean
}

export function runSwitch(name: string | undefined, opts: SwitchOptions): number {
  if (opts.none) {
    writeActiveProfile(null)
    ok("active profile cleared", opts)
    return 0
  }
  if (!name) {
    fail("missing profile name (or pass --none to clear)", opts)
    return 1
  }
  if (!isValidProfileName(name)) {
    fail(`invalid profile name: ${JSON.stringify(name)}`, opts)
    return 1
  }
  const file = paths.profileFile(name)
  if (!opts.force && !existsSync(file)) {
    fail(`profile file does not exist: ${file} (use --force to set anyway)`, opts)
    return 1
  }
  writeActiveProfile(name)
  ok(`active profile set to "${name}" — restart OpenCode to apply`, opts)
  return 0
}
```

- [ ] **Step 3: Register `switch` in `packages/cli/src/index.ts`**

Replace the existing `// Subcommands are registered in subsequent tasks.` line with:

```ts
import { runSwitch } from "./commands/switch.js"

program
  .command("switch [name]")
  .description("Set the active profile (use --none to clear)")
  .option("--force", "Set even if the overlay file does not exist")
  .option("--none", "Clear the active profile (deletes profile.active)")
  .action((name: string | undefined, cmdOpts: { force?: boolean; none?: boolean }) => {
    const global = program.opts<{ quiet?: boolean; json?: boolean }>()
    const code = runSwitch(name, { ...global, ...cmdOpts })
    if (code !== 0) process.exit(code)
  })
```

- [ ] **Step 4: Smoke-test inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
export OPENCODE_PROFILE_TEST_HOME=/tmp/oc-prof-smoke
rm -rf "$OPENCODE_PROFILE_TEST_HOME" && mkdir -p "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles"
echo '{}' > "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/work.jsonc"

node packages/cli/dist/index.js switch work
test -f "$OPENCODE_PROFILE_TEST_HOME/opencode/profile.active" && echo "STATE OK"
node packages/cli/dist/index.js switch --none
test ! -f "$OPENCODE_PROFILE_TEST_HOME/opencode/profile.active" && echo "CLEAR OK"

# Negative path: nonexistent profile
node packages/cli/dist/index.js switch ghost; echo "exit=$?"  # expect non-zero
```

Expected output: `STATE OK`, `CLEAR OK`, then a non-zero exit for the `ghost` profile.

- [ ] **Step 5: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/src/commands/switch.ts packages/cli/src/index.ts
git commit -m "feat(cli): add switch command with --none and --force"
git push -u origin cli/switch
gh pr create --draft \
  --base cli/scaffold \
  --head cli/switch \
  --title "feat(cli): add switch command with --none and --force" \
  --body "Implements Task 3.2 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_1_URL>."
```

Record as **PR_3_2_URL**.

---

### Task 3.3: `list` command (enumerate profile files)

- **派生元ブランチ**: `cli/switch`
- **実行モード**: 直列必須 (Wait for Task 3.2)
- **前提条件**: `PR_3_2_URL` が存在すること
- **Branch to create**: `cli/list`

**Files:**
- Create: `packages/cli/src/commands/list.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/switch
git pull --ff-only origin cli/switch
git checkout -b cli/list

set -euo pipefail
EXPECTED_BASE="cli/switch"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/src/commands/list.ts`**

```ts
import { existsSync, readdirSync } from "node:fs"
import { paths } from "@yohi/opencode-profile-core"
import { emitJson, info, type UIOptions } from "../ui/feedback.js"

export function runList(opts: UIOptions): number {
  const dir = paths.profilesDir()
  const entries = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".jsonc"))
        .map((f) => f.slice(0, -".jsonc".length))
        .sort()
    : []
  if (opts.json) {
    emitJson({ profiles: entries, dir })
    return 0
  }
  if (entries.length === 0) {
    info(`no profiles found under ${dir}`, opts)
    return 0
  }
  for (const name of entries) console.log(name)
  return 0
}
```

- [ ] **Step 3: Register `list` in `packages/cli/src/index.ts`**

After the existing `switch` registration block, add:

```ts
import { runList } from "./commands/list.js"

program
  .command("list")
  .description("List available overlays under profiles/")
  .action(() => {
    const code = runList(program.opts<{ quiet?: boolean; json?: boolean }>())
    if (code !== 0) process.exit(code)
  })
```

- [ ] **Step 4: Smoke-test inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
export OPENCODE_PROFILE_TEST_HOME=/tmp/oc-prof-list
rm -rf "$OPENCODE_PROFILE_TEST_HOME" && mkdir -p "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles"

node packages/cli/dist/index.js list                          # info: no profiles found

echo '{}' > "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/work.jsonc"
echo '{}' > "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/private.jsonc"
node packages/cli/dist/index.js list                          # prints "private\nwork"
node packages/cli/dist/index.js --json list                   # prints {"profiles":[...],"dir":"..."}
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/src/commands/list.ts packages/cli/src/index.ts
git commit -m "feat(cli): add list command with --json support"
git push -u origin cli/list
gh pr create --draft \
  --base cli/switch \
  --head cli/list \
  --title "feat(cli): add list command with --json support" \
  --body "Implements Task 3.3 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_2_URL>."
```

Record as **PR_3_3_URL**.

---

### Task 3.4: `current` command (print active profile + source)

- **派生元ブランチ**: `cli/list`
- **実行モード**: 直列必須 (Wait for Task 3.3)
- **前提条件**: `PR_3_3_URL` が存在すること
- **Branch to create**: `cli/current`

**Files:**
- Create: `packages/cli/src/commands/current.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/list
git pull --ff-only origin cli/list
git checkout -b cli/current

set -euo pipefail
EXPECTED_BASE="cli/list"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/src/commands/current.ts`**

```ts
import { readActiveProfile, resolveActiveProfile } from "@yohi/opencode-profile-core"
import { emitJson, info, type UIOptions } from "../ui/feedback.js"

export function runCurrent(opts: UIOptions): number {
  const env = process.env.OPENCODE_PROFILE
  let source: "env" | "state" | "none"
  let value: string | null
  if (env !== undefined) {
    source = "env"
    value = resolveActiveProfile(process.env)
  } else {
    const fromState = readActiveProfile()
    if (fromState !== null) {
      source = "state"
      value = fromState
    } else {
      source = "none"
      value = null
    }
  }
  if (opts.json) {
    emitJson({ profile: value, source })
    return 0
  }
  if (value === null) {
    info(`no active profile (source: ${source})`, opts)
  } else {
    console.log(`${value}\t(source: ${source})`)
  }
  return 0
}
```

- [ ] **Step 3: Register `current` in `packages/cli/src/index.ts`**

```ts
import { runCurrent } from "./commands/current.js"

program
  .command("current")
  .description("Print the active profile and its source (env/state/none)")
  .action(() => {
    const code = runCurrent(program.opts<{ quiet?: boolean; json?: boolean }>())
    if (code !== 0) process.exit(code)
  })
```

- [ ] **Step 4: Smoke-test inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
export OPENCODE_PROFILE_TEST_HOME=/tmp/oc-prof-current
rm -rf "$OPENCODE_PROFILE_TEST_HOME" && mkdir -p "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles"
echo '{}' > "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/work.jsonc"

node packages/cli/dist/index.js current                       # info: no active profile (source: none)
node packages/cli/dist/index.js switch work >/dev/null
node packages/cli/dist/index.js current                       # work\t(source: state)
OPENCODE_PROFILE=private node packages/cli/dist/index.js current  # private\t(source: env)
OPENCODE_PROFILE= node packages/cli/dist/index.js current --json  # {"profile":null,"source":"env"}
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/src/commands/current.ts packages/cli/src/index.ts
git commit -m "feat(cli): add current command reporting profile and source"
git push -u origin cli/current
gh pr create --draft \
  --base cli/list \
  --head cli/current \
  --title "feat(cli): add current command reporting profile and source" \
  --body "Implements Task 3.4 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_3_URL>."
```

Record as **PR_3_4_URL**.

---

### Task 3.5: `show` command (parse and print overlay)

- **派生元ブランチ**: `cli/current`
- **実行モード**: 直列必須 (Wait for Task 3.4)
- **前提条件**: `PR_3_4_URL` が存在すること
- **Branch to create**: `cli/show`

**Files:**
- Create: `packages/cli/src/commands/show.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/current
git pull --ff-only origin cli/current
git checkout -b cli/show

set -euo pipefail
EXPECTED_BASE="cli/current"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/src/commands/show.ts`**

```ts
import { existsSync } from "node:fs"
import {
  isValidProfileName,
  paths,
  readJsoncFile,
} from "@yohi/opencode-profile-core"
import { emitJson, fail, type UIOptions } from "../ui/feedback.js"

export function runShow(name: string, opts: UIOptions): number {
  if (!isValidProfileName(name)) {
    fail(`invalid profile name: ${JSON.stringify(name)}`, opts)
    return 1
  }
  const file = paths.profileFile(name)
  if (!existsSync(file)) {
    fail(`profile file does not exist: ${file}`, opts)
    return 1
  }
  try {
    const value = readJsoncFile(file)
    if (opts.json) emitJson(value)
    else console.log(JSON.stringify(value, null, 2))
    return 0
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), opts)
    return 2
  }
}
```

- [ ] **Step 3: Register `show` in `packages/cli/src/index.ts`**

```ts
import { runShow } from "./commands/show.js"

program
  .command("show <name>")
  .description("Print the overlay file's parsed content")
  .action((name: string) => {
    const code = runShow(name, program.opts<{ quiet?: boolean; json?: boolean }>())
    if (code !== 0) process.exit(code)
  })
```

- [ ] **Step 4: Smoke-test inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
export OPENCODE_PROFILE_TEST_HOME=/tmp/oc-prof-show
rm -rf "$OPENCODE_PROFILE_TEST_HOME" && mkdir -p "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles"
cat > "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/work.jsonc" <<'EOF'
{ /* hi */ "model": "claude-opus-4-7", "instructions": ["a"], }
EOF

node packages/cli/dist/index.js show work                      # pretty-printed JSON
node packages/cli/dist/index.js show ghost; echo "exit=$?"     # non-zero
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/src/commands/show.ts packages/cli/src/index.ts
git commit -m "feat(cli): add show command to print parsed overlay"
git push -u origin cli/show
gh pr create --draft \
  --base cli/current \
  --head cli/show \
  --title "feat(cli): add show command to print parsed overlay" \
  --body "Implements Task 3.5 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_4_URL>."
```

Record as **PR_3_5_URL**.

---

### Task 3.6: `diff` command (base vs base+overlay)

- **派生元ブランチ**: `cli/show`
- **実行モード**: 直列必須 (Wait for Task 3.5)
- **前提条件**: `PR_3_5_URL` が存在すること
- **Branch to create**: `cli/diff`

**Files:**
- Create: `packages/cli/src/commands/diff.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/show
git pull --ff-only origin cli/show
git checkout -b cli/diff

set -euo pipefail
EXPECTED_BASE="cli/show"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/src/commands/diff.ts`**

```ts
import { existsSync } from "node:fs"
import {
  deepMergeConfig,
  isValidProfileName,
  paths,
  readJsoncFile,
} from "@yohi/opencode-profile-core"
import { emitJson, fail, info, type UIOptions } from "../ui/feedback.js"

function unifiedDiff(beforeText: string, afterText: string): string {
  const before = beforeText.split("\n")
  const after = afterText.split("\n")
  const out: string[] = []
  const max = Math.max(before.length, after.length)
  for (let i = 0; i < max; i++) {
    const a = before[i]
    const b = after[i]
    if (a === b) continue
    if (a !== undefined) out.push(`- ${a}`)
    if (b !== undefined) out.push(`+ ${b}`)
  }
  return out.join("\n")
}

export function runDiff(name: string, opts: UIOptions): number {
  if (!isValidProfileName(name)) {
    fail(`invalid profile name: ${JSON.stringify(name)}`, opts)
    return 1
  }
  const base = paths.baseConfig()
  const overlayPath = paths.profileFile(name)
  if (!existsSync(base)) { fail(`base config not found: ${base}`, opts); return 1 }
  if (!existsSync(overlayPath)) { fail(`overlay not found: ${overlayPath}`, opts); return 1 }

  const baseCfg = readJsoncFile(base) as Record<string, unknown>
  const overlay = readJsoncFile(overlayPath) as Record<string, unknown>
  const merged = deepMergeConfig(baseCfg, overlay)

  if (opts.json) {
    emitJson({ base: baseCfg, overlay, merged })
    return 0
  }

  const beforeText = JSON.stringify(baseCfg, null, 2)
  const afterText = JSON.stringify(merged, null, 2)
  const diff = unifiedDiff(beforeText, afterText)
  if (diff === "") info("no differences", opts)
  else console.log(diff)
  return 0
}
```

- [ ] **Step 3: Register `diff` in `packages/cli/src/index.ts`**

```ts
import { runDiff } from "./commands/diff.js"

program
  .command("diff <name>")
  .description("Show effective diff between base and base+overlay")
  .action((name: string) => {
    const code = runDiff(name, program.opts<{ quiet?: boolean; json?: boolean }>())
    if (code !== 0) process.exit(code)
  })
```

- [ ] **Step 4: Smoke-test inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
export OPENCODE_PROFILE_TEST_HOME=/tmp/oc-prof-diff
rm -rf "$OPENCODE_PROFILE_TEST_HOME" && mkdir -p "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles"
echo '{ "model": "base", "instructions": ["b1"] }' > "$OPENCODE_PROFILE_TEST_HOME/opencode/opencode.jsonc"
echo '{ "model": "work", "instructions": ["b1", "w1"] }' > "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/work.jsonc"

node packages/cli/dist/index.js diff work                     # shows model + instructions diff
node packages/cli/dist/index.js --json diff work | head -c 80 # JSON output
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/src/commands/diff.ts packages/cli/src/index.ts
git commit -m "feat(cli): add diff command (base vs base+overlay)"
git push -u origin cli/diff
gh pr create --draft \
  --base cli/show \
  --head cli/diff \
  --title "feat(cli): add diff command (base vs base+overlay)" \
  --body "Implements Task 3.6 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_5_URL>."
```

Record as **PR_3_6_URL**.

---

### Task 3.7: `init` command (scaffold an empty overlay)

- **派生元ブランチ**: `cli/diff`
- **実行モード**: 直列必須 (Wait for Task 3.6)
- **前提条件**: `PR_3_6_URL` が存在すること
- **Branch to create**: `cli/init`

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/diff
git pull --ff-only origin cli/diff
git checkout -b cli/init

set -euo pipefail
EXPECTED_BASE="cli/diff"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/src/commands/init.ts`**

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { isValidProfileName, paths } from "@yohi/opencode-profile-core"
import { fail, ok, type UIOptions } from "../ui/feedback.js"

const TEMPLATE = `// opencode-profile overlay
// Keys present here override / extend the base opencode.jsonc.
// Arrays replace by default; \`instructions\` is concat-merged with dedup.
{
}
`

export function runInit(name: string, opts: UIOptions): number {
  if (!isValidProfileName(name)) {
    fail(`invalid profile name: ${JSON.stringify(name)}`, opts)
    return 1
  }
  const file = paths.profileFile(name)
  if (existsSync(file)) {
    fail(`profile file already exists: ${file}`, opts)
    return 1
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, TEMPLATE, { encoding: "utf8", mode: 0o644 })
  ok(`created ${file}`, opts)
  return 0
}
```

- [ ] **Step 3: Register `init` in `packages/cli/src/index.ts`**

```ts
import { runInit } from "./commands/init.js"

program
  .command("init <name>")
  .description("Create an empty overlay file scaffold")
  .action((name: string) => {
    const code = runInit(name, program.opts<{ quiet?: boolean; json?: boolean }>())
    if (code !== 0) process.exit(code)
  })
```

- [ ] **Step 4: Smoke-test inside the Devcontainer**

```bash
npm run build -w @yohi/opencode-profile-cli
export OPENCODE_PROFILE_TEST_HOME=/tmp/oc-prof-init
rm -rf "$OPENCODE_PROFILE_TEST_HOME"
node packages/cli/dist/index.js init work
test -f "$OPENCODE_PROFILE_TEST_HOME/opencode/profiles/work.jsonc" && echo "INIT OK"
node packages/cli/dist/index.js init work; echo "exit=$?"   # non-zero (already exists)
```

- [ ] **Step 5: Typecheck, lint, format**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: 0 errors.

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/src/commands/init.ts packages/cli/src/index.ts
git commit -m "feat(cli): add init command to scaffold an empty overlay"
git push -u origin cli/init
gh pr create --draft \
  --base cli/diff \
  --head cli/init \
  --title "feat(cli): add init command to scaffold an empty overlay" \
  --body "Implements Task 3.7 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_6_URL>."
```

Record as **PR_3_7_URL**.

---

### Task 3.8: CLI E2E smoke tests (vitest + execa)

- **派生元ブランチ**: `cli/init`
- **実行モード**: 直列必須 (Wait for Task 3.7)
- **前提条件**: `PR_3_7_URL` が存在すること
- **Branch to create**: `cli/e2e`

**Files:**
- Create: `packages/cli/test/e2e.test.ts`
- Modify: `packages/cli/vitest.config.ts` (enable coverage threshold)

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/init
git pull --ff-only origin cli/init
git checkout -b cli/e2e

set -euo pipefail
EXPECTED_BASE="cli/init"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `packages/cli/test/e2e.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest"
import { execa } from "execa"
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const CLI = resolve(__dirname, "..", "dist", "index.js")
let HOME_DIR: string

beforeAll(async () => {
  // Build the CLI once before the E2E suite.
  await execa("npm", ["run", "build", "-w", "@yohi/opencode-profile-cli"], {
    cwd: resolve(__dirname, "..", "..", ".."),
    stdio: "inherit",
  })
})

beforeEach(() => {
  HOME_DIR = mkdtempSync(join(tmpdir(), "opencode-profile-e2e-"))
  mkdirSync(join(HOME_DIR, "opencode", "profiles"), { recursive: true })
})

afterEach(() => {
  rmSync(HOME_DIR, { recursive: true, force: true })
})

function run(args: string[], env: Record<string, string> = {}) {
  return execa("node", [CLI, ...args], {
    env: { OPENCODE_PROFILE_TEST_HOME: HOME_DIR, ...env },
    reject: false,
  })
}

describe("opencode-profile CLI (E2E)", () => {
  it("list on empty state exits 0 with info message", async () => {
    const r = await run(["list"])
    expect(r.exitCode).toBe(0)
  })

  it("init creates the overlay scaffold", async () => {
    const r = await run(["init", "work"])
    expect(r.exitCode).toBe(0)
    expect(existsSync(join(HOME_DIR, "opencode", "profiles", "work.jsonc"))).toBe(true)
  })

  it("switch updates the state file and prints a restart hint", async () => {
    writeFileSync(join(HOME_DIR, "opencode", "profiles", "work.jsonc"), "{}", "utf8")
    const r = await run(["switch", "work"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout + r.stderr).toMatch(/restart OpenCode/i)
    expect(existsSync(join(HOME_DIR, "opencode", "profile.active"))).toBe(true)
  })

  it("switch on missing profile exits non-zero", async () => {
    const r = await run(["switch", "ghost"])
    expect(r.exitCode).not.toBe(0)
  })

  it("current prints the source (state)", async () => {
    writeFileSync(join(HOME_DIR, "opencode", "profiles", "work.jsonc"), "{}", "utf8")
    await run(["switch", "work"])
    const r = await run(["current"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/work.*state/)
  })

  it("current prints the source (env)", async () => {
    const r = await run(["current"], { OPENCODE_PROFILE: "private" })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toMatch(/private.*env/)
  })

  it("switch --none removes the state file", async () => {
    writeFileSync(join(HOME_DIR, "opencode", "profiles", "work.jsonc"), "{}", "utf8")
    await run(["switch", "work"])
    const r = await run(["switch", "--none"])
    expect(r.exitCode).toBe(0)
    expect(existsSync(join(HOME_DIR, "opencode", "profile.active"))).toBe(false)
  })

  it("rejects invalid profile names", async () => {
    const r = await run(["switch", "a/b"])
    expect(r.exitCode).not.toBe(0)
  })
})
```

- [ ] **Step 3: Update `packages/cli/vitest.config.ts` to enforce coverage**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000, // build step in beforeAll
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { lines: 60, statements: 60, functions: 60, branches: 50 },
    },
  },
})
```

- [ ] **Step 4: Run the E2E suite inside the Devcontainer**

```bash
npm test -w @yohi/opencode-profile-cli -- --run --reporter=basic
```

Expected: 8 tests pass.

- [ ] **Step 5: Full repo verification**

```bash
npm run ci
```

Expected: format:check, lint, typecheck, test all pass (all three packages green).

- [ ] **Step 6: Commit, push, Draft PR**

```bash
git add packages/cli/test/e2e.test.ts packages/cli/vitest.config.ts
git commit -m "test(cli): add execa-based E2E smoke suite"
git push -u origin cli/e2e
gh pr create --draft \
  --base cli/init \
  --head cli/e2e \
  --title "test(cli): add execa-based E2E smoke suite" \
  --body "Implements Task 3.8 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_7_URL>."
```

Record as **PR_3_8_URL**.

---

## Phase 4 — Release prep

### Task 4.1: README + npm metadata polish

- **派生元ブランチ**: `cli/e2e`
- **実行モード**: 直列必須 (Wait for Task 3.8)
- **前提条件**: `PR_3_8_URL` が存在すること
- **Branch to create**: `release/readme`

**Files:**
- Create: `README.md`
- Modify: `packages/core/package.json` (description, repository, keywords)
- Modify: `packages/plugin/package.json` (description, repository, keywords)
- Modify: `packages/cli/package.json` (description, repository, keywords)

- [ ] **Step 1: Branch creation and base validation (inside the Devcontainer)**

```bash
git fetch origin
git checkout cli/e2e
git pull --ff-only origin cli/e2e
git checkout -b release/readme

set -euo pipefail
EXPECTED_BASE="cli/e2e"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git merge-base --is-ancestor "${EXPECTED_BASE}" "${CURRENT_BRANCH}" \
  || { echo "ERROR: 派生元ブランチが ${EXPECTED_BASE} ではありません。スタック構造が壊れています。"; exit 1; }
echo "OK: ${CURRENT_BRANCH} is a descendant of ${EXPECTED_BASE}."
```

- [ ] **Step 2: Write `README.md`**

```markdown
# opencode-profile

Overlay per-profile differences (e.g. `work` / `private`) onto your base
`opencode.jsonc` at OpenCode plugin load time, in-memory, without touching
the base file on disk.

## Install

```bash
# Plugin (referenced from opencode.jsonc):
npm install @yohi/opencode-profile

# CLI:
npm install -g @yohi/opencode-profile-cli
```

Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["@yohi/opencode-profile"]
}
```

## Layout

```
~/.config/opencode/
├── opencode.jsonc        (base — never modified)
├── profile.active        (state file)
└── profiles/
    ├── work.jsonc
    └── private.jsonc
```

## CLI

| Command | Description |
| --- | --- |
| `opencode-profile switch <name>` | Set the active profile |
| `opencode-profile switch --none` | Clear the active profile |
| `opencode-profile list` | List available overlays |
| `opencode-profile current` | Print the active profile and its source |
| `opencode-profile show <name>` | Print a parsed overlay |
| `opencode-profile diff <name>` | Show base vs base+overlay diff |
| `opencode-profile init <name>` | Scaffold an empty overlay |

Restart OpenCode after `switch` to apply.

## License

MIT
```

- [ ] **Step 3: Polish each package's `package.json` metadata**

Add the following top-level fields to `packages/core/package.json` (merge with existing keys, do not replace):
```jsonc
{
  "description": "Shared utilities for opencode-profile (paths, JSONC, deep merge, state)",
  "keywords": ["opencode", "profile", "config", "jsonc", "overlay"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yohi/opencode-profile.git",
    "directory": "packages/core"
  }
}
```

Add the following top-level fields to `packages/plugin/package.json`:
```jsonc
{
  "description": "OpenCode plugin that overlays a per-profile JSONC onto the cached config",
  "keywords": ["opencode", "opencode-plugin", "profile", "config", "overlay"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yohi/opencode-profile.git",
    "directory": "packages/plugin"
  }
}
```

Add the following top-level fields to `packages/cli/package.json`:
```jsonc
{
  "description": "CLI to manage the active OpenCode profile (switch / list / show / diff / init)",
  "keywords": ["opencode", "profile", "cli", "config"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/yohi/opencode-profile.git",
    "directory": "packages/cli"
  }
}
```

- [ ] **Step 4: Final repo verification**

```bash
npm run ci
```

Expected: 0 errors.

- [ ] **Step 5: Commit, push, Draft PR**

```bash
git add README.md packages/core/package.json packages/plugin/package.json packages/cli/package.json
git commit -m "docs: add README and polish package metadata for npm publication"
git push -u origin release/readme
gh pr create --draft \
  --base cli/e2e \
  --head release/readme \
  --title "docs: add README and polish package metadata for npm publication" \
  --body "Implements Task 4.1 from docs/superpowers/plans/2026-05-24-opencode-profile.md. Parent PR: <PR_3_8_URL>."
```

Record as **PR_4_1_URL**.

---

## Plan completion criteria

The plan is "implemented" when:

- All 18 Draft PRs exist and stack cleanly from `release/readme` → … → `setup/foundation` → `main`.
- `npm run ci` passes on the tip of `release/readme` inside the Devcontainer.
- Coverage thresholds are enforced and met: `core` ≥ 90% lines, `plugin` ≥ 70%, `cli` ≥ 60%.
- A human reviewer (not the agent) flips PRs from Draft → Ready and merges them in order, bottom-up (Task 0.1 first, Task 4.1 last).
