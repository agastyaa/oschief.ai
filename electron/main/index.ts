import { app, BrowserWindow, protocol, globalShortcut, dialog } from 'electron'
import { join, normalize, extname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { createMainWindow, getMainWindow } from './windows'
import { setupTray } from './tray'
import { registerIPCHandlers } from './ipc-handlers'
import { initDatabase, getSetting } from './storage/database'
import { ICloudSyncedDBPath } from './errors'
import { startSync, stopSync } from './storage/icloud-sync'
import { ensureModelsDir } from './models/manager'
import { startMeetingDetection, stopMeetingDetection } from './meeting-detector'
import { setupPowerMonitor } from './power-manager'
import { startApiServer, stopApiServer, getApiToken } from './api/server'
import { loadOptionalProviders } from './cloud/optional-providers-loader'
import { loadCustomProviders } from './cloud/router'
import { setupAutoUpdater } from './auto-updater'
import { registerTask, stopScheduler } from './scheduler'

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
    // R1a: iCloud-synced userData path detected — refuse to launch, offer quit.
    // (Auto-migration is deferred to v2.11.1; v2.11.0 surfaces the problem clearly.)
    if (err instanceof ICloudSyncedDBPath) {
      const reason = (err as any).meta?.reason === 'mobile-documents'
        ? 'iCloud Drive (~/Library/Mobile Documents)'
        : 'an iCloud-managed folder (fileprovider xattr detected)'
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'OSChief cannot launch safely',
        message: 'Your OSChief data folder is in ' + reason + '.',
        detail:
          'SQLite WAL mode can silently corrupt databases in iCloud-synced folders. ' +
          'OSChief refuses to launch until the data is on a local-only path.\n\n' +
          'Fix: open System Settings → Apple ID → iCloud → iCloud Drive → Apps using ' +
          'iCloud Drive and disable "Desktop & Documents Folders," OR move ' +
          '~/Library/Application Support/OSChief to a non-iCloud location, then relaunch.',
        buttons: ['Quit'],
        defaultId: 0,
      })
      app.quit()
      return
    }
    console.error('Failed to initialize database:', err)
  }

  ensureModelsDir()
  // Clean up stale temp files from previous sessions (orphaned WAV chunks)
  import('./models/stt-engine').then(({ cleanStaleTempFiles }) => cleanStaleTempFiles()).catch(() => {})
  // Pre-load VAD model in background so first recording starts instantly (no 500ms delay)
  import('./audio/vad').then(({ ensureVADModel }) => ensureVADModel()).catch(() => {})
  // R6 — pre-warm the user's default Ollama model so first coaching/summary call
  // doesn't pay the cold-load tax (5-15s on 8B+ models). Silent on failure.
  Promise.all([
    import('./models/model-resolver'),
    import('./cloud/ollama'),
  ]).then(([{ resolveSelectedAIModel }, { prewarmOllama }]) => {
    const resolved = resolveSelectedAIModel()
    if (resolved.startsWith('ollama:')) {
      const modelTag = resolved.slice('ollama:'.length)
      prewarmOllama(modelTag).then((ok) => {
        console.log(`[ollama] prewarm ${modelTag}: ${ok ? 'ok' : 'skipped/failed'}`)
      }).catch(() => {})
    }
  }).catch(() => {})
  registerIPCHandlers()
  loadOptionalProviders()
  loadCustomProviders()

  // Start iCloud sync if enabled
  if (getSetting('icloud-sync-enabled') === 'true') {
    startSync()
  }

  // Mark overdue commitments + check risk transitions on startup + every 15 minutes
  // Uses central scheduler instead of independent setInterval (reduces event loop wakeups)
  import('./memory/commitment-store').then(({ markOverdueCommitments, checkAmberTransitions, clearSnoozeForOverdue }) => {
    registerTask('commitments', 15 * 60 * 1000, () => {
      markOverdueCommitments()
      checkAmberTransitions()
      clearSnoozeForOverdue()
    }, { pauseWhenHidden: true, runImmediately: true })
    console.log('[commitments] Overdue marking + risk scoring active (startup + 15min interval, via scheduler)')
  }).catch(() => {})

  // Smart meeting reminders — 5 min before each meeting
  import('./notifications/meeting-reminder').then(({ startMeetingReminders }) => {
    startMeetingReminders()
  }).catch(() => {})

  // Schedule routines (daily brief, weekly recap, etc.) + catch-up missed briefs
  import('./routines/routines-engine').then(({ scheduleAllRoutines, rescheduleAllRoutines, catchUpMorningBrief, catchUpEndOfDay, catchUpMissedRoutines }) => {
    scheduleAllRoutines()
    // Fire catch-up after a short delay to let DB settle
    setTimeout(() => {
      catchUpMorningBrief().catch(e => console.error('[routines] Morning brief catch-up failed:', e))
      catchUpEndOfDay().catch(e => console.error('[routines] End-of-day catch-up failed:', e))
      catchUpMissedRoutines().catch(e => console.error('[routines] Missed routines catch-up failed:', e))
    }, 3000)
    console.log('[routines] Scheduled all enabled routines on app start')

    // Reschedule all routines after wake from sleep (timers drift during sleep)
    import('electron').then(({ powerMonitor }) => {
      powerMonitor.on('resume', () => {
        console.log('[routines] System resumed from sleep — rescheduling all routines')
        rescheduleAllRoutines()
        // Catch up missed routines after a longer delay to avoid double-fire
        // (give rescheduled timers time to settle before checking for misses)
        setTimeout(() => {
          catchUpMorningBrief().catch(e => console.error('[routines] Morning brief catch-up failed:', e))
          catchUpEndOfDay().catch(e => console.error('[routines] End-of-day catch-up failed:', e))
          catchUpMissedRoutines().catch(e => console.error('[routines] Missed routines catch-up failed:', e))
        }, 10000) // 10s delay (was 2s) — lets scheduled timers fire first to avoid double execution
      })
    })
  }).catch(e => console.error('[routines] Failed to initialize routines engine:', e))

  // Data cleanup — prune stale rows daily to keep DB small
  import('./storage/data-cleanup').then(({ runDataCleanup }) => {
    registerTask('data-cleanup', 24 * 60 * 60 * 1000, runDataCleanup, { pauseWhenHidden: true, runImmediately: true })
    console.log('[data-cleanup] Registered (daily)')
  }).catch(e => console.error('[data-cleanup] Failed to initialize:', e))

  // Background Gmail sync — sync every 30 minutes (token resolved from keychain inside syncGmailThreads)
  import('./integrations/mail-store').then(({ syncGmailThreads }) => {
    // Initial sync after a short delay
    setTimeout(() => syncGmailThreads().catch(e => console.error('[mail-sync] Initial sync failed:', e)), 5000)
    // Register with central scheduler for periodic sync
    registerTask('mail-sync', 30 * 60 * 1000, () => {
      syncGmailThreads().catch(e => console.error('[mail-sync] Periodic sync failed:', e))
    }, { pauseWhenHidden: true, runImmediately: false })
    console.log('[mail-sync] Background Gmail sync registered (30min interval)')
  }).catch(e => console.error('[mail-sync] Failed to initialize mail store:', e))

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

  // Pre-download diarization models so they're ready when needed
  try {
    const diarizationEnabled = getSetting('use-diarization')
    if (diarizationEnabled !== 'false') {
      import('./audio/streaming-diarizer').then(({ StreamingDiarizer }) => {
        const diarizer = new StreamingDiarizer()
        diarizer.ensureModel().then(() => {
          console.log('[startup] Diarization models ready')
        }).catch((err) => {
          console.warn('[startup] Diarization model download failed (will retry on use):', err)
        })
      }).catch(() => {})
    }
  } catch {}

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
  stopScheduler()
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
