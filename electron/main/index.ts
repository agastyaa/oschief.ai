import { app, BrowserWindow, protocol, globalShortcut } from 'electron'
import { join, normalize, extname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { createMainWindow, getMainWindow } from './windows'
import { setupTray } from './tray'
import { registerIPCHandlers } from './ipc-handlers'
import { initDatabase, getSetting } from './storage/database'
import { startSync, stopSync } from './storage/icloud-sync'
import { ensureModelsDir } from './models/manager'
import { startMeetingDetection, stopMeetingDetection } from './meeting-detector'
import { setupPowerMonitor } from './power-manager'
import { startApiServer, stopApiServer, getApiToken } from './api/server'
import { loadOptionalProviders } from './cloud/optional-providers-loader'
import { setupAutoUpdater } from './auto-updater'

app.setName('OSChief')

// Custom protocol so the packaged app loads the renderer over app:// instead of file://,
// avoiding blank screen (file:// blocks ES module scripts / CORS in Chromium).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

app.whenReady().then(async () => {
  if (!process.env.ELECTRON_RENDERER_URL) {
    const rendererDir = normalize(join(__dirname, '..', 'renderer'))
    protocol.handle('app', (request) => {
      const u = new URL(request.url)
      let p = u.pathname.replace(/^\/+/, '').replace(/^\.\/+/, '') || 'index.html'
      const filePath = normalize(join(rendererDir, p))
      if (!filePath.startsWith(rendererDir)) {
        return new Response('Forbidden', { status: 403 })
      }
      if (!existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }
      const ext = extname(filePath) || '.html'
      const contentType = MIME[ext] ?? 'application/octet-stream'
      const body = readFileSync(filePath)
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': contentType },
      })
    })
  }

  try {
    initDatabase()
  } catch (err) {
    console.error('Failed to initialize database:', err)
  }
  ensureModelsDir()
  // Clean up stale temp files from previous sessions (orphaned WAV chunks)
  import('./models/stt-engine').then(({ cleanStaleTempFiles }) => cleanStaleTempFiles()).catch(() => {})
  // Pre-load VAD model in background so first recording starts instantly (no 500ms delay)
  import('./audio/vad').then(({ ensureVADModel }) => ensureVADModel()).catch(() => {})
  registerIPCHandlers()
  loadOptionalProviders()

  // Start iCloud sync if enabled
  if (getSetting('icloud-sync-enabled') === 'true') {
    startSync()
  }

  // Smart meeting reminders — 5 min before each meeting
  import('./notifications/meeting-reminder').then(({ startMeetingReminders }) => {
    startMeetingReminders()
  }).catch(() => {})

  // Schedule routines (daily brief, weekly recap, etc.)
  import('./routines/routines-engine').then(({ scheduleAllRoutines }) => {
    scheduleAllRoutines()
    console.log('[routines] Scheduled all enabled routines on app start')
  }).catch(() => {})

  // Zero-config auto-setup: download best STT + LLM models on first launch
  import('./models/auto-setup').then(({ runAutoSetup, isSetupComplete }) => {
    if (isSetupComplete()) return
    runAutoSetup((status) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('setup:progress', status)
      }
    }).then((result) => {
      if (result.ok) {
        console.log(`[auto-setup] Done — Track ${result.track}: STT=${result.sttModel}, LLM=${result.llmModel}`)
      }
    }).catch((err) => {
      console.error('[auto-setup] Unexpected error:', err)
    })
  }).catch(() => {})

  // Start Agent API if enabled and token exists
  if (getSetting('api-enabled') === 'true' && getApiToken()) {
    startApiServer().catch(err => console.error('[api] Failed to start:', err))
  }

  // Use app icon in Dock for dev and local builds (packaged app also gets it from bundle)
  if (process.platform === 'darwin' && app.dock) {
    try {
      // Try .icns first, fall back to PNG
      const icnsPath = process.defaultApp
        ? join(process.cwd(), 'electron', 'resources', 'icon.icns')
        : join(process.resourcesPath, 'icon.icns')
      const pngPath = process.defaultApp
        ? join(process.cwd(), 'public', 'dock-icon-1024.png')
        : join(process.resourcesPath, 'dock-icon-1024.png')
      const iconPath = existsSync(icnsPath) ? icnsPath : existsSync(pngPath) ? pngPath : null
      if (iconPath) app.dock.setIcon(iconPath)
    } catch (e) {
      console.warn('Could not set dock icon:', e)
    }
  }

  const mainWindow = createMainWindow()
  setupTray(mainWindow)
  startMeetingDetection(mainWindow)
  setupPowerMonitor(mainWindow)

  // Auto-updates (skip in dev)
  if (app.isPackaged) {
    setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else {
      getMainWindow()?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Global keyboard shortcut: Cmd+Shift+R to toggle recording from anywhere on the Mac
app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    const win = getMainWindow()
    if (!win) return
    // Send toggle to renderer — it decides whether to start or stop recording
    win.webContents.send('global:toggle-recording')
    // Also bring window to front
    win.show()
    win.focus()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  stopSync()
  stopMeetingDetection()
  stopApiServer().catch(() => {})
  // Kill all STT workers/processes to prevent orphaned zombies
  import('./models/stt-engine').then(({ killAllSTTProcesses }) => killAllSTTProcesses()).catch(() => {})
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('close')
  }
})
