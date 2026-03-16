# Releasing SDKs

This guide covers how to publish Maestra SDKs to their respective package registries, and the one-time setup required before the first release.

## Overview

Each SDK has a dedicated GitHub Actions workflow that publishes to the appropriate registry when a Git tag is pushed. A coordinated release workflow and Makefile targets make it easy to bump versions and trigger publishes.

| SDK | Tag Pattern | Publishes To | Secret Required |
|-----|------------|--------------|-----------------|
| Python | `python/v*` | PyPI | None (OIDC trusted publisher) |
| JS/TS | `js/v*` | npm (`@maestra/sdk`) | `NPM_TOKEN` |
| Arduino | `arduino/v*` | PlatformIO Registry | `PLATFORMIO_AUTH_TOKEN` |
| Unity | `unity/v*` | `upm` branch + OpenUPM version tag | None |
| Unreal | `unreal/v*` | GitHub Release (zip) | None |
| TouchDesigner | `touchdesigner/v*` | GitHub Release (zip) | None |

## How to do a release

### Option A: From the command line

```bash
# Single SDK
make release-python VERSION=0.2.0

# All SDKs at once
make release-all VERSION=0.2.0
```

Each target bumps the version in the manifest, commits, tags, and pushes — triggering the publish workflow automatically.

Available targets:

```bash
make release-python VERSION=x.y.z
make release-js VERSION=x.y.z
make release-arduino VERSION=x.y.z
make release-unity VERSION=x.y.z
make release-unreal VERSION=x.y.z
make release-td VERSION=x.y.z
make release-all VERSION=x.y.z
```

### Option B: From GitHub Actions UI

1. Go to **Actions → Release SDK → Run workflow**
2. Pick the SDK (or "all"), enter the version
3. Optionally check **Dry run** to bump versions without publishing

### Option C: Manual tagging

If the version is already bumped in the manifest:

```bash
git tag python/v0.2.0 -m "Python SDK v0.2.0"
git push origin python/v0.2.0
```

All publish workflows verify the tag version matches the manifest version before publishing, so mismatches are caught early.

## Version bump utility

The `scripts/bump-sdk-version.sh` script updates version numbers across SDK manifest files:

```bash
# Bump a single SDK
./scripts/bump-sdk-version.sh python 0.2.0

# Bump all SDKs at once
./scripts/bump-sdk-version.sh all 0.2.0
```

Supported SDK names: `python`, `js`, `unity`, `unreal`, `arduino`, `touchdesigner`, `all`

The script validates semver format and updates the correct field in each manifest:

| SDK | Manifest File | Field Updated |
|-----|--------------|---------------|
| Python | `sdks/python/pyproject.toml` | `version` |
| JS/TS | `sdks/js/package.json` | `version` |
| Unity | `sdks/unity/package.json` | `version` |
| Unreal | `sdks/unreal/MaestraPlugin/MaestraPlugin.uplugin` | `VersionName` |
| Arduino | `sdks/arduino/MaestraClient/library.json` | `version` |
| TouchDesigner | _(no manifest)_ | Version tracked via Git tag only |

---

## One-time setup (before first publish)

These steps need to be done **once** by a repo admin. The workflows are ready — they just need the external accounts and secrets configured.

### 1. PyPI (Python SDK)

1. Register or claim the `maestra` package name on [pypi.org](https://pypi.org)
2. Go to the package's **Settings → Publishing → Add a new publisher**
3. Select **GitHub Actions** and enter:
    - **Owner:** `maestra` (or your GitHub org)
    - **Repository:** `maestra-core`
    - **Workflow name:** `publish-python.yml`
    - **Environment:** `pypi`
4. In the GitHub repo, go to **Settings → Environments → New environment** and create one called `pypi`

No API token needed — PyPI's OIDC trusted publisher handles authentication automatically.

### 2. npm (JS/TS SDK)

1. Create the `@maestra` org on [npmjs.com](https://www.npmjs.com) (or use your existing org)
2. Go to **Account → Access Tokens → Generate New Token**
3. Choose **Automation** token type
4. In the GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret**
5. Add secret: Name = `NPM_TOKEN`, Value = the token from step 3
6. Create a GitHub environment called `npm` under **Settings → Environments**

### 3. PlatformIO (Arduino SDK)

1. Create a [PlatformIO](https://platformio.org) account if you don't have one
2. Run `pio account token` locally (or generate one from the PlatformIO web UI)
3. In the GitHub repo, add a repository secret: Name = `PLATFORMIO_AUTH_TOKEN`, Value = the token
4. Create a GitHub environment called `platformio` under **Settings → Environments**

### 4. OpenUPM (Unity SDK)

1. Go to [openupm.com/packages/add](https://openupm.com/packages/add/)
2. Submit the package:
    - **Package name:** `dev.maestra.sdk`
    - **Repository URL:** `https://github.com/maestra/maestra-core` (or your repo URL)
    - **Branch:** `upm`
3. Once approved, Unity developers can install with: `openupm add dev.maestra.sdk`

The `publish-unity.yml` workflow automatically maintains the `upm` branch via `git subtree split`.

### 5. Unreal Fab Store (manual)

The `publish-unreal.yml` workflow creates a GitHub Release with a downloadable zip. To also list on the Fab Store:

1. After a release, download `MaestraPlugin-x.y.z.zip` from the GitHub Release
2. Go to [fab.com](https://www.fab.com) and submit through the creator portal
3. This is a manual process — Epic does not offer CI/CD for Fab Store submissions

### 6. TouchDesigner (no external setup)

The `publish-touchdesigner.yml` workflow creates a GitHub Release with a downloadable zip. No external registry to configure. Users download directly from GitHub Releases.

---

## Workflow files reference

| File | Purpose |
|------|---------|
| `.github/workflows/publish-python.yml` | Build and publish to PyPI on `python/v*` tag |
| `.github/workflows/publish-js.yml` | Build and publish to npm on `js/v*` tag |
| `.github/workflows/publish-arduino.yml` | Publish to PlatformIO on `arduino/v*` tag |
| `.github/workflows/publish-unity.yml` | Update `upm` branch and tag on `unity/v*` tag |
| `.github/workflows/publish-unreal.yml` | Create GitHub Release with zip on `unreal/v*` tag |
| `.github/workflows/publish-touchdesigner.yml` | Create GitHub Release with zip on `touchdesigner/v*` tag |
| `.github/workflows/release-sdk.yml` | Manual dispatch: bump version, commit, tag, trigger publish |
| `scripts/bump-sdk-version.sh` | CLI utility to update version in manifest files |
