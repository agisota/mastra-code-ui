# Monorepo Migration Plan: mastra-code-ui → mastra

Move the `mastra-code` Electron app into the `mastra-ai/mastra` monorepo so that
changes to `@mastra/core`, `@mastra/memory`, `@mastra/mcp`, and `@mastra/libsql`
are tested and released in lockstep with the app.

---

## 1. Where It Lives

Place the package at **`mastra-code/`** (top-level), following the precedent set by
`mastracode/` (the TUI/CLI). Both are end-user applications, not library packages,
so they sit outside `packages/`.

```
mastra/
├── mastracode/        # existing TUI/CLI
├── mastra-code/       # ← new Electron app
├── packages/
│   ├── core/
│   ├── memory/
│   ├── mcp/
│   └── ...
└── ...
```

Add to `pnpm-workspace.yaml`:

```yaml
packages:
  - mastracode
  - mastra-code        # ← add
  - packages/*
  # ...existing entries
```

---

## 2. Package.json Changes

### 2.1 Switch to workspace deps

```jsonc
{
  // before
  "@mastra/core": "1.8.0",
  "@mastra/libsql": "1.6.2",
  "@mastra/mcp": "1.0.2",
  "@mastra/memory": "1.5.2",

  // after
  "@mastra/core": "workspace:*",
  "@mastra/libsql": "workspace:*",
  "@mastra/mcp": "workspace:*",
  "@mastra/memory": "workspace:*"
}
```

### 2.2 Align tooling versions

| Field | Current (mastra-code-ui) | Monorepo | Action |
|-------|--------------------------|----------|--------|
| `packageManager` | `pnpm@10.20.0` | `pnpm@10.29.3` | Remove from package — root controls this |
| `typescript` | `^5.8.0` | `^5.9.3` (catalog) | Use catalog: `catalog:` |
| `vitest` | `^4.0.18` | `4.0.18` (catalog) | Use catalog |
| `@types/node` | `^25.0.10` | `22.19.7` (resolution) | Align to monorepo resolution |
| `prettier` | `^3.8.1` | `^3.6.2` (root) | Remove — use root prettier |
| `husky` | `^9.1.7` | `^9.1.7` (root) | Remove — root handles hooks |
| `lint-staged` | `^16.2.7` | `^16.2.7` (root) | Remove — root handles lint-staged |

### 2.3 Mark as private

The Electron app is not published to npm, so add:

```json
{
  "private": true
}
```

### 2.4 Remove root-level config duplication

Delete from the package:
- `.husky/` — root monorepo already has husky
- `.prettierrc` — use root prettier config
- `.editorconfig` — use root config
- `lint-staged` config in package.json — root handles this

Keep:
- `electron.vite.config.ts` — app-specific
- `vitest.config.ts` — app-specific test config
- `tsconfig.json` — needs electron/renderer-specific settings

---

## 3. Build Integration

### 3.1 Turbo task

Add to root `turbo.json`:

```jsonc
{
  "tasks": {
    // ...existing tasks
    "package:electron": {
      "dependsOn": ["^build"],
      "outputs": ["release/**"],
      "cache": false,
      "env": [
        "CSC_LINK",
        "CSC_KEY_PASSWORD",
        "APPLE_ID",
        "APPLE_APP_SPECIFIC_PASSWORD",
        "APPLE_TEAM_ID"
      ]
    }
  }
}
```

Add `package:electron` script to `mastra-code/package.json`:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package:electron": "electron-vite build && node scripts/copy-native-bindings.js && electron-builder --mac",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

### 3.2 Turbo build dependency

The `build` task already has `"dependsOn": ["^build"]`, so `mastra-code`'s
`electron-vite build` will automatically wait for `@mastra/core` etc. to finish
building first. No extra config needed for dev builds.

### 3.3 Native bindings

`node-pty` and `@ast-grep/napi` require platform-specific native builds. These
should be listed in the root `pnpm.onlyBuiltDependencies` if not already, and the
existing `scripts/copy-native-bindings.js` stays in `mastra-code/scripts/`.

---

## 4. Changeset Config

Since `mastra-code` is `"private": true`, it won't be published to npm. Update
`.changeset/config.json`:

```jsonc
{
  "ignore": [
    // ...existing entries
    "mastra-code"  // ← add: skip npm publishing
  ]
}
```

However, changesets are still useful for tracking what changed. When a PR updates
both `@mastra/core` and `mastra-code`, the changeset for core triggers a version
bump + npm publish, and the mastra-code changes ride along in the same PR without
a separate version bump.

---

## 5. CI/CD: Electron Build + Release

### 5.1 New workflow: `electron-build.yml`

Triggered on PRs that touch `mastra-code/**` — builds the app to verify nothing
is broken, but does not package/sign.

```yaml
name: Electron Build
on:
  pull_request:
    paths:
      - "mastra-code/**"
      - "packages/core/**"
      - "packages/memory/**"
      - "packages/mcp/**"
      - "packages/libsql/**"

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build --filter=mastra-code...
      - run: pnpm --filter mastra-code typecheck
      - run: pnpm --filter mastra-code test
```

**Key detail:** The `--filter=mastra-code...` (with `...`) tells turbo to build
mastra-code _and all its workspace dependencies_. This ensures `@mastra/core`
etc. are built first.

### 5.2 New workflow: `electron-release.yml`

Triggered manually or on git tags matching `mastra-code@*`. Builds, signs,
notarizes, and publishes to GitHub Releases.

```yaml
name: Electron Release
on:
  workflow_dispatch:
    inputs:
      version:
        description: "Release version (e.g. 1.2.0)"
        required: true
  push:
    tags:
      - "mastra-code@*"

jobs:
  release:
    runs-on: macos-latest
    strategy:
      matrix:
        arch: [arm64, x64]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build --filter=mastra-code...
      - name: Package & Sign
        env:
          CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          pnpm --filter mastra-code exec electron-builder --mac --${{ matrix.arch }}
      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: mastra-code@${{ inputs.version || github.ref_name }}
          files: mastra-code/release/*.dmg
          draft: true
```

---

## 6. Code Signing & Notarization

Required for macOS distribution outside the App Store.

### 6.1 Prerequisites

- Apple Developer Program membership ($99/year)
- Developer ID Application certificate (exported as .p12)
- App-specific password for notarization

### 6.2 GitHub Secrets to configure

| Secret | Description |
|--------|-------------|
| `MAC_CERT_P12_BASE64` | Base64-encoded .p12 certificate |
| `MAC_CERT_PASSWORD` | Password for the .p12 file |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

### 6.3 electron-builder config additions

Add to `build` section in package.json:

```jsonc
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "afterSign": "electron-builder-notarize",
    "publish": {
      "provider": "github",
      "owner": "mastra-ai",
      "repo": "mastra"
    }
  }
}
```

### 6.4 Entitlements file

Create `mastra-code/build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

These entitlements are necessary for Electron + node-pty (spawning shells)
and network access (API calls to model providers).

---

## 7. Auto-Update

Add `electron-updater` so installed copies can self-update from GitHub Releases.

### 7.1 Install

```bash
pnpm --filter mastra-code add electron-updater
```

### 7.2 Wire into main process

In `src/electron/main.ts`, add after app ready:

```ts
import { autoUpdater } from "electron-updater"

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify()
})
```

### 7.3 electron-builder publish config

Already covered in section 6.3 — the `publish.provider: "github"` config tells
electron-updater where to check for new releases.

### 7.4 Update flow

1. Tag a release → CI builds + signs DMGs → uploads to GitHub Release (draft)
2. Manually publish the draft release on GitHub
3. Running instances of Mastra Code detect the new release via electron-updater
4. User gets a notification and can restart to update

---

## 8. Migration Steps

### Phase 1: Move the code

```bash
# In the mastra monorepo
git subtree add --prefix=mastra-code \
  git@github.com:mastra-ai/mastra-code-ui.git main --squash

# Or to preserve full history:
git remote add mastra-code-ui git@github.com:mastra-ai/mastra-code-ui.git
git fetch mastra-code-ui
git merge -s ours --no-commit --allow-unrelated-histories mastra-code-ui/main
git read-tree --prefix=mastra-code/ -u mastra-code-ui/main
git commit -m "feat: add mastra-code electron app to monorepo"
```

The subtree approach (first option) is simpler and gives a clean single commit.
The merge approach preserves the full git history for `git log -- mastra-code/`.

The source currently has a `beirut/` subdirectory structure — flatten this so that
`mastra-code/package.json` is at the top level of the new directory (not
`mastra-code/beirut/package.json`).

### Phase 2: Adapt to monorepo

1. Update `pnpm-workspace.yaml` — add `mastra-code`
2. Update `package.json`:
   - Switch `@mastra/*` deps to `workspace:*`
   - Remove `packageManager` field
   - Add `"private": true`
   - Align dev dependency versions to catalog
   - Remove husky/lint-staged/prettier configs
3. Delete `.husky/`, `.prettierrc`, `.editorconfig` from `mastra-code/`
4. Update `tsconfig.json` to extend monorepo root config where possible
5. Run `pnpm install` from monorepo root
6. Verify `pnpm turbo build --filter=mastra-code...` works
7. Verify `pnpm --filter mastra-code dev` works
8. Verify `pnpm --filter mastra-code test` works

### Phase 3: CI/CD

1. Add `electron-build.yml` workflow (PR validation)
2. Add `electron-release.yml` workflow (packaging + publishing)
3. Set up Apple Developer certificates + GitHub Secrets
4. Update `.changeset/config.json` to ignore `mastra-code`
5. Test a draft release end-to-end

### Phase 4: Auto-update

1. Add `electron-updater` dependency
2. Wire auto-update check into main process
3. Add `publish` config to electron-builder
4. Test update flow: install old version → publish new release → verify update

### Phase 5: Archive old repo

1. Update `mastra-ai/mastra-code-ui` README to point to monorepo
2. Archive the repository on GitHub (Settings → Archive)
3. Ensure any existing issues/PRs are migrated or closed

---

## 9. What Changes for Development

### Before (separate repo)

```bash
cd mastra-code-ui/beirut
pnpm install
pnpm dev
# To test with local @mastra/core changes: pnpm link ../mastra/packages/core
```

### After (monorepo)

```bash
cd mastra
pnpm install              # installs everything, workspace:* links are automatic
pnpm --filter mastra-code dev
# Changes to packages/core are picked up immediately after rebuild
pnpm turbo build --filter=mastra-code...  # builds core + deps + app
```

### UPSTREAM_HARNESS_GAPS.md

This file becomes actionable in-repo. Open gaps (1, 9, 10, 11) can be resolved
as PRs that modify both `packages/core` and `mastra-code` in a single changeset.
The file should be kept until all gaps are closed, then deleted.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Electron deps bloat `pnpm install` for all contributors | `pnpm install --filter=!mastra-code` skips it; native deps are already in `onlyBuiltDependencies` |
| macOS-only CI runners are slower/more expensive | Only trigger on `mastra-code/**` path changes; cache aggressively |
| Native binding issues across Node versions | Pin Node version in CI; `copy-native-bindings.js` already handles pnpm flat layout |
| Monorepo `pnpm install` breaks on Linux/Windows due to `node-pty` macOS postinstall | Wrap postinstall in platform check: `[[ "$OSTYPE" == "darwin"* ]] && chmod ...` or use `optionalDependencies` |
| Breaking changes to `@mastra/core` silently break the app | `electron-build.yml` runs on core changes; turbo dependency graph ensures correct build order |

---

## 11. Future: Windows & Linux

The current build targets macOS only. When ready to expand:

1. Add `win` and `linux` targets to electron-builder config
2. Add `windows-latest` and `ubuntu-latest` runners to `electron-release.yml` matrix
3. Code signing for Windows requires an EV certificate (different process)
4. Linux targets: AppImage, deb, snap (no signing required for most)
5. `node-pty` and `@ast-grep/napi` have prebuilds for all three platforms — no
   source compilation needed

This is independent of the monorepo migration and can happen at any time after.
