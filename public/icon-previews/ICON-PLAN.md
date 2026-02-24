# Icon update plan (show before making changes)

## Source assets (from your files)

- **`public/app-icon.svg`** – 512×512, dark gradient background, white brain+pen strokes, rounded rect.
- **`public/tray-icon.svg`** – Black (#111111) brain+pen on transparent, 22×22 viewBox (template-style for menu bar).

## Where each will be used

| Use | Source | Result |
|-----|--------|--------|
| **Mac Dock / Finder (app icon)** | app-icon.svg | Rendered at 1024→iconset→icon.icns. Same dark rounded icon in the Dock. |
| **In-app (beside “syag” in sidebar)** | app-icon.svg | Rendered at 96×96 → syag-logo-inapp.png. Shows next to “syag” text. |
| **Favicon** | app-icon.svg | 32×32 PNG. |
| **Menu bar (tray)** | tray-icon.svg | Rendered at 44×44 (2x). Black-on-transparent, macOS standard like Claude/Syag/Cursor. |
| **Tray when recording** | tray-icon.svg + red dot | Same icon with small red dot overlay. |

## macOS tray standard (Claude, Syag, Cursor)

- Single color (black/dark) on transparent so the system can tint for light/dark menu bar.
- Size: 22pt @1x, 44pt @2x → we use 44×44 px.
- Your tray-icon.svg is already in this style (#111111 strokes, no fill, transparent).

## What you’ll see after

1. **Dock** – Dark rounded square with white brain+pen (from app-icon.svg).
2. **Sidebar** – Same icon at 24px next to “syag”.
3. **Menu bar** – Black outline brain+pen on transparent (from tray-icon.svg), system tinted.

No other logic or UI text changes; only these assets are swapped in.

## Preview files (see before/after)

- **preview-tray.png** – Tray icon as it appears in the menu bar (44×44, black on transparent).
- **preview-inapp.png** – In-app icon beside “syag” (96×96, dark bg + white brain+pen).
- **preview-app-dock.png** – Same as in-app; this is what the Dock icon is based on (1024→.icns).
