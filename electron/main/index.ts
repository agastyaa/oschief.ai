import { app, BrowserWindow, protocol } from 'electron'
import { join, normalize, extname } from 'path'
import { readFileSync, existsSync } from 'fs'
import { createMainWindow, getMainWindow } from './windows'
import { setupTray } from './tray'
import { registerIPCHandlers } from './ipc-handlers'
import { initDatabase } from './storage/database'
import { ensureModelsDir } from './models/manager'
import { startMeetingDetection, stopMeetingDetection } from './meeting-detector'
import { setupPowerMonitor } from './power-manager'

app.setName('Syag')

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
  registerIPCHandlers()

  const mainWindow = createMainWindow()
  setupTray(mainWindow)
  startMeetingDetection(mainWindow)
  setupPowerMonitor(mainWindow)

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

app.on('before-quit', () => {
  stopMeetingDetection()
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('close')
  }
})
