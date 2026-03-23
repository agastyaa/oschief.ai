# Releasing Syag (macOS) — auto-updates

Syag uses **electron-updater** with the **GitHub** provider (`electron-builder.yml` → `publish.provider: github`).

## Why in-app “Check for updates” did nothing

The updater does **not** read the GitHub releases web page. It downloads a small metadata file from the release assets, typically:

- **`latest-mac.yml`** — version, download URL, SHA512 checksums  
- **`Syag-<version>-arm64.zip`** — the build used for **silent install** (required alongside or instead of relying on DMG-only flows)

If a release only has **`.dmg`** plus **source archives**, there is **no `latest-mac.yml`**, so `electron-updater` cannot see a newer version. Users must install from the DMG manually until the release is fixed.

## Correct way to publish a version

**Preferred:** push a git tag so CI publishes everything:

```bash
# After bumping version in package.json and updating CHANGELOG
git tag v1.10.3
git push origin v1.10.3
```

The workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) runs:

```bash
npx electron-builder --mac --publish always
```

That uploads the DMG, **zip**, **`latest-mac.yml`**, and related blockmap files to the GitHub release.

**Requirements:** repo secrets for signing/notarization (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_*`) must be set; otherwise the workflow may fail and you might fall back to a **manual** release (easy to forget the yml/zip).

**Local publish** (alternative):

```bash
export GH_TOKEN=ghp_...   # classic PAT with repo scope, or fine-grained with Contents: Read/Write
npm run build
npx electron-builder --mac --publish always
```

Do **not** use `npm run package` for a public release by itself — that script uses `--publish never` and only builds locally.

## Fixing an already-published release (e.g. 1.10.2)

1. Run a full publish for that tag from a machine with signing secrets, **or**  
2. Re-run the **Release** GitHub Action for the tag after fixing secrets, **or**  
3. Manually attach to the GitHub release the **`latest-mac.yml`** and **`Syag-<version>-arm64.zip`** from a local `electron-builder --mac --publish always` output (under `dist/`).

Until `latest-mac.yml` (and the zip it points to) are on the release, in-app updates will not work for that version.

## Verify

After publishing, open the release on GitHub and confirm assets include at least:

- `Syag-<version>-arm64.dmg`
- `Syag-<version>-arm64.zip`
- `latest-mac.yml`

Then in the app: **Settings → About → Check for updates** should show either “latest” or start a download with a clear message.
