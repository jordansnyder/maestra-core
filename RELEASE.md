# Releasing Maestra

This is the operator runbook for shipping Maestra's distributable artifacts:
the **9 SDKs**, the **Docker images**, and the **desktop app** (with
auto-update). It covers the one-time account/secret setup you still need to do,
then the repeatable release procedure.

> **Repo:** `jordansnyder/maestra-core`
> **Versioning:** every SDK manifest is kept at the *same* semantic version. A CI
> gate (`check-sdk-versions.yml`) fails any change that lets them drift.

---

## 1. How releasing works (the model)

Everything is **git-tag driven**. Pushing a tag triggers the matching publish
workflow:

| Tag pattern | Workflow | Destination |
|-------------|----------|-------------|
| `python/v*` | `publish-python.yml` | PyPI (`maestra`) |
| `js/v*` | `publish-js.yml` | npm (`@maestra/sdk`) |
| `unity/v*` | `publish-unity.yml` | OpenUPM (`dev.maestra.sdk`, via `upm` branch) |
| `arduino/v*` | `publish-arduino.yml` | PlatformIO Registry |
| `unreal/v*` | `publish-unreal.yml` | GitHub Release (.zip) |
| `processing/v*` | `publish-processing.yml` | GitHub Release (.zip) |
| `maxmsp/v*` | `publish-maxmsp.yml` | GitHub Release (.zip) |
| `touchdesigner/v*` | `publish-touchdesigner.yml` | GitHub Release (.zip) |
| `openframeworks/v*` | `publish-openframeworks.yml` | GitHub Release (.zip) |
| `desktop/v*` | `release-desktop.yml` | GitHub Release (installers + updater) |
| push to `main` (services/) | `publish-docker-images.yml` | GHCR (7 images) |

You normally don't push tags by hand — use the `make release-*` targets or the
**Release SDK** workflow (section 4).

---

## 2. One-time account & secret setup

This is the part that was outstanding. Do these once. Each row says **who/where**
and the **exact value** to use.

### 2.1 GitHub repo secrets

Add under **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Needed for | How to get it |
|--------|-----------|---------------|
| `NPM_TOKEN` | npm publish | §2.3 |
| `PLATFORMIO_AUTH_TOKEN` | Arduino/PlatformIO publish | §2.5 |
| `TAURI_SIGNING_PRIVATE_KEY` | desktop auto-update | §2.7 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | desktop auto-update | §2.7 (empty string if you generated without a password) |
| `APPLE_CERTIFICATE` | macOS signing | Apple Developer (already wired in `release-desktop.yml`) |
| `APPLE_CERTIFICATE_PASSWORD` | macOS signing | the P12 export password |
| `APPLE_SIGNING_IDENTITY` | macOS signing | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | macOS notarization | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization | appleid.apple.com → app-specific password |
| `APPLE_TEAM_ID` | macOS notarization | 10-char Team ID |

PyPI needs **no token** — it uses OIDC trusted publishing (§2.2).

### 2.2 PyPI (`maestra`) — OIDC trusted publisher

1. Create/log in at <https://pypi.org>.
2. If the name is free, you'll create the project on first publish — but set up
   the **pending trusted publisher** first so the first publish works:
   - Go to <https://pypi.org/manage/account/publishing/>.
   - Add a **GitHub** trusted publisher:
     - Owner: `jordansnyder`
     - Repository: `maestra-core`
     - Workflow filename: `publish-python.yml`
     - Environment: `pypi`
3. In GitHub, create the **`pypi` environment** (Settings → Environments → New) —
   no secrets needed; the workflow already targets `environment: pypi`.
4. ✅ Done. No token is ever stored.

> If `maestra` is already taken on PyPI by someone else, you'll need a different
> project name — update `name` in `sdks/python/pyproject.toml` and the URL in
> `publish-python.yml`.

### 2.3 npm (`@maestra/sdk`)

1. Log in at <https://www.npmjs.com>.
2. Create the **`@maestra` org**: <https://www.npmjs.com/org/create> (free for
   public packages). The package is published with `--access public`.
3. Create a **granular access token**: Profile → Access Tokens → Generate →
   *Granular*. Scope it to **Read and write** for the `@maestra` packages/org.
   Copy the token.
4. Add it to GitHub as `NPM_TOKEN` (§2.1).
5. Create the **`npm` environment** in GitHub (the workflow targets
   `environment: npm`).

### 2.4 OpenUPM (Unity — `dev.maestra.sdk`)

The `publish-unity.yml` workflow maintains an `upm` branch (git subtree split of
`sdks/unity/`) and tags it. OpenUPM builds from that.

1. Cut at least one `unity/v*` release first (so the `upm` branch + tag exist).
2. Submit the package at <https://openupm.com/packages/add/>:
   - Repo: `https://github.com/jordansnyder/maestra-core`
   - OpenUPM auto-detects `package.json`; confirm name `dev.maestra.sdk`.
3. Add the OpenUPM badge to `sdks/unity/README.md` once accepted (optional).

No secret required — OpenUPM pulls from the public repo.

### 2.5 PlatformIO (Arduino — `MaestraClient`)

1. Create an account at <https://platformio.org>.
2. Generate a token: <https://platformio.org/account/tokens> (or
   `pio account token`).
3. Add it to GitHub as `PLATFORMIO_AUTH_TOKEN` (§2.1).

### 2.6 Arduino Library Manager (optional, separate from PlatformIO)

To appear in the Arduino IDE's Library Manager (not just PlatformIO):
1. Ensure a `arduino/v*` release/tag exists.
2. Submit the repo URL via the issue form at
   <https://github.com/arduino/library-registry> (one-time; auto-indexed
   thereafter from `library.properties`).

### 2.7 Tauri updater signing key (desktop auto-update)

A keypair was generated locally at `~/.maestra/updater_key` (private) and
`~/.maestra/updater_key.pub` (public). The **public** key is already committed in
`desktop/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

Add the **private** key to GitHub secrets:

```bash
# macOS — copies the private key to the clipboard, then paste as TAURI_SIGNING_PRIVATE_KEY
cat ~/.maestra/updater_key | pbcopy
```

- `TAURI_SIGNING_PRIVATE_KEY` = contents of `~/.maestra/updater_key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = empty string (the key was generated
  without a password)

> ⚠️ **Back up `~/.maestra/updater_key` somewhere safe (password manager).** If
> you lose it you cannot sign updates that existing installs will accept, and
> you'd have to ship a new app with a new pubkey. Never commit it.

---

## 3. Pre-release checklist

```bash
# 1. All SDK manifests agree on the version (CI enforces this too)
bash scripts/check-sdk-versions.sh

# 2. Dry-run the version bump to the target version and inspect the diff
scripts/bump-sdk-version.sh all 0.2.0
git diff
git checkout -- .        # revert the dry-run

# 3. Desktop: build + tests green
cd desktop && npm ci && npm test && npm run build
cd src-tauri && cargo test && cd ../..
```

---

## 4. Cutting an SDK release

Two equivalent paths.

### Option A — `make` (local)

```bash
make release-all VERSION=0.2.0          # all 9 SDKs
# or one at a time:
make release-python  VERSION=0.2.0
make release-js      VERSION=0.2.0
make release-of      VERSION=0.2.0      # OpenFrameworks
# (also: release-arduino, release-unity, release-unreal, release-td,
#  release-processing, release-maxmsp)
```

Each target bumps the manifest, commits, tags `*/vX.Y.Z`, and pushes — which
fires the publish workflow.

### Option B — GitHub UI (no local checkout)

**Actions → Release SDK → Run workflow.** Pick the SDK (or `all`), enter the
version, optionally tick **dry_run** first to bump+commit without tagging.

---

## 5. Cutting a desktop release (with auto-update)

1. Bump the desktop version in `desktop/src-tauri/tauri.conf.json` (and
   `desktop/package.json` to match), commit.
2. Tag and push:
   ```bash
   git tag desktop/v0.2.0 -m "Maestra Desktop v0.2.0"
   git push origin desktop/v0.2.0
   ```
3. `release-desktop.yml` builds macOS (arm64 + x86_64), Windows, and Linux,
   signs/notarizes macOS, signs the updater artifacts, and creates a **draft**
   GitHub Release with the installers + `latest.json`.
4. Review the draft, then **Publish** it.
5. Publishing fires `desktop-updater-manifest.yml`, which copies `latest.json`
   onto the `updater` branch. Installed apps poll
   `https://raw.githubusercontent.com/jordansnyder/maestra-core/updater/latest.json`
   and will offer the update on next launch.

> Updates only go live **after** you publish the draft — that's the intended
> gate. A draft's assets aren't downloadable, so the manifest job won't run until
> publish.

---

## 6. Docker images

Pushing to `main` with changes under `services/` (or `docker-compose.yml`) builds
and pushes 7 images to GHCR via `publish-docker-images.yml`. No tag needed. To
cut versioned images, trigger it manually (workflow_dispatch) or rely on the
SHA/`latest` tags it produces.

---

## 7. Post-release verification

| Target | Check |
|--------|-------|
| PyPI | `pip install maestra==0.2.0` |
| npm | `npm view @maestra/sdk version` |
| OpenUPM | package page shows the new version (can lag ~30 min) |
| PlatformIO | `pio pkg show MaestraClient` |
| GitHub Releases | the .zip assets exist and download |
| Desktop updater | an older install offers the update on launch |
| GHCR | `docker pull ghcr.io/jordansnyder/maestra-fleet-manager:latest` |

---

## 8. First-launch order (recommended)

1. §2.7 Tauri key + §2.1 secrets, §2.2 PyPI, §2.3 npm, §2.5 PlatformIO.
2. `make release-all VERSION=0.1.0` → confirm PyPI + npm + PlatformIO + GitHub
   Releases all land.
3. §2.4 OpenUPM submit (needs the `unity/v0.1.0` tag from step 2).
4. §2.6 Arduino Library Manager submit (optional).
5. Desktop: add Apple secrets, then `desktop/v0.1.0` (section 5).
