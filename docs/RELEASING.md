# Release Process

OSChief ships as a signed + notarized macOS DMG through GitHub Releases. The
`release.yml` workflow is triggered by pushing a `v*` tag.

## Prerequisites (one-time setup)

Set the following GitHub Actions secrets in repo **Settings → Secrets and
variables → Actions**:

| Secret | What it is | How to get it |
|---|---|---|
| `CSC_LINK` | base64-encoded Developer ID `.p12` signing certificate | `base64 -i DeveloperID.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | password for the `.p12` | whatever you set when exporting from Keychain |
| `APPLE_ID` | Apple Developer account email | `your.email@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for notarization | [appleid.apple.com](https://appleid.apple.com) → Sign-In & Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character team id | `4TF93K384V` (already hardcoded in `electron-builder.yml`, but pass as env for redundancy) |

`GITHUB_TOKEN` is auto-provided by Actions for the `publish` step.

## Shipping a release

From a clean `main` (or the release branch merged into main):

```bash
# 1. Make sure CHANGELOG.md has the release entry + VERSION is bumped
cat VERSION                  # e.g. 2.10.0.0
grep '"version"' package.json  # e.g. "version": "2.10.0"

# 2. Tag and push
git tag -a v2.10.0 -m "v2.10 Stabilize"
git push origin v2.10.0

# 3. Watch the workflow
gh run watch
```

The workflow will:
1. Check out the tagged commit
2. `npm ci` + `npm run build` (electron-vite)
3. `electron-builder --mac --publish always`
   - Signs the `.app` with the Developer ID cert
   - Notarizes via Apple's service (3-10 min)
   - Staples the ticket
   - Publishes DMG + ZIP + `latest-mac.yml` to the GitHub Release

## Verifying the release

```bash
# Confirm the artifacts are attached
gh release view v2.10.0

# Smoke test the download on a fresh machine / VM
# 1. Download the DMG from the release page
# 2. Verify signature: codesign -dv --verbose=4 /Applications/OSChief.app
# 3. Verify notarization: spctl --assess --verbose=4 /Applications/OSChief.app
#    Expected: "accepted\nsource=Notarized Developer ID"
```

## Auto-update flow

Once a release is published:
- Existing v2.x.x installs check `latest-mac.yml` on launch + every 4 hours
- Download happens in background
- User gets tray banner "⬆ Restart & install vX.Y.Z" (or in-app dialog if window visible)
- Restart installs the new version

Private-repo releases require a `GH_TOKEN` in the user's shell profile — the
auto-updater reads it from `~/.zshrc` / `~/.zprofile` / `~/.bashrc` at
startup.

## Local DMG builds (no notarization)

For local dev DMGs without hitting Apple's notarization service:

```bash
# Temporarily set APPLE_ID etc. to skip, or edit electron-builder.yml:
#   notarize: false
npm run package:clean
```

The generated `dist/OSChief-X.Y.Z-arm64.dmg` will be signed but **not
notarized** — Gatekeeper will block on first launch; right-click → Open to
bypass.

## Version bumps

Next release:

```bash
# Patch (2.10.0 → 2.10.1)
npm version patch --no-git-tag-version

# Minor (2.10.x → 2.11.0)
npm version minor --no-git-tag-version

# Update VERSION file to match
echo "2.11.0.0" > VERSION

# Update CHANGELOG.md
# Commit, push, tag as above
```

## Rollback

If a bad release ships:

```bash
# 1. Unpublish the GitHub Release (keeps the tag)
gh release delete v2.10.0 --cleanup-tag

# 2. Force-delete the tag everywhere
git push origin :refs/tags/v2.10.0
git tag -d v2.10.0

# 3. Existing installs on v2.10.0 will keep running but won't auto-update
# until you ship v2.10.1 with the fix
```
