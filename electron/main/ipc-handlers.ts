import { ipcMain, systemPreferences, desktopCapturer, app, safeStorage, BrowserWindow } from 'electron'
import { getMainWindow, setContentProtection } from './windows'
import { updateTrayRecordingState, updateTrayMeetingInfo, rebuildTrayContextMenu } from './tray'
import { setCalendarEvents } from './meeting-detector'
import {
  getAllNotes, getNote, addNote, updateNote, deleteNote, updateNoteFolder,
  getAllFolders, addFolder, updateFolder, deleteFolder,
  getSetting, setSetting, getAllSettings,
  getAllLocalCalendarBlocks, addLocalCalendarBlock, deleteLocalCalendarBlock,
} from './storage/database'
import {
  setTrayAgendaCache,
  getTrayAgendaCache,
  showMainWindowCalendar,
  showMainWindowSettings,
  showMainWindowApp,
  startNewNoteFromTrayAgenda,
  quitFromTrayAgenda,
  openNoteOrNewMeetingFromTray,
} from './tray-agenda-window'
import { downloadModel, cancelDownload, deleteModel, listDownloadedModels } from './models/manager'
import type { LocalSetupResult } from './models/stt-engine'
import { netFetch } from './cloud/net-request'
import { startRecording, stopRecording, pauseRecording, resumeRecording, processAudioChunk } from './audio/capture'
import { summarize } from './models/llm-engine'
import { chat, getOptionalProviders } from './cloud/router'
import { checkAppleFoundationAvailable } from './cloud/apple-llm'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const keychainPath = () => {
  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'keychain.enc')
}

function loadKeychain(): Record<string, string> {
  const path = keychainPath()
  if (!existsSync(path)) return {}
  try {
    const encrypted = readFileSync(path)
    const decrypted = safeStorage.decryptString(encrypted)
    return JSON.parse(decrypted)
  } catch {
    return {}
  }
}

function saveKeychain(data: Record<string, string>): void {
  const encrypted = safeStorage.encryptString(JSON.stringify(data))
  writeFileSync(keychainPath(), encrypted)
}

export function registerIPCHandlers(): void {
  // --- Auto-Setup ---
  ipcMain.handle('setup:is-complete', async () => {
    const { isSetupComplete } = await import('./models/auto-setup')
    return isSetupComplete()
  })
  ipcMain.handle('setup:retry', async (_e) => {
    const { BrowserWindow } = await import('electron')
    const { runAutoSetup } = await import('./models/auto-setup')
    const { setSetting } = await import('./storage/database')
    setSetting('auto-setup-complete', '') // Reset so it re-runs
    return runAutoSetup((status) => {
      const win = BrowserWindow.getFocusedWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('setup:progress', status)
      }
    })
  })

  // --- Notes ---
  ipcMain.handle('db:notes-get-all', () => getAllNotes())
  ipcMain.handle('db:notes-get', (_e, id: string) => getNote(id))
  ipcMain.handle('db:notes-add', (_e, note: any) => { addNote(note); return true })
  ipcMain.handle('db:notes-update', (_e, id: string, data: any) => { updateNote(id, data); return true })
  ipcMain.handle('db:notes-delete', (_e, id: string) => { deleteNote(id); return true })
  ipcMain.handle('db:notes-update-folder', (_e, noteId: string, folderId: string | null) => {
    updateNoteFolder(noteId, folderId); return true
  })

  // --- Folders ---
  ipcMain.handle('db:folders-get-all', () => getAllFolders())
  ipcMain.handle('db:folders-add', (_e, folder: any) => { addFolder(folder); return true })
  ipcMain.handle('db:folders-update', (_e, id: string, data: any) => { updateFolder(id, data); return true })
  ipcMain.handle('db:folders-delete', (_e, id: string) => { deleteFolder(id); return true })

  // --- Settings ---
  ipcMain.handle('db:settings-get', (_e, key: string) => getSetting(key))
  ipcMain.handle('db:settings-set', (_e, key: string, value: string) => {
    setSetting(key, value)
    if (key === 'tray-calendar-agenda') rebuildTrayContextMenu()
    return true
  })
  ipcMain.handle('db:settings-get-all', () => getAllSettings())

  // --- Models ---
  const WHISPER_CPP_MODEL_IDS = ['whisper-large-v3-turbo']
  ipcMain.handle('models:download', async (_e, modelId: string) => {
    const sender = _e.sender
    try {
      await downloadModel(modelId, (progress) => {
        sender.send('models:download-progress', progress)
      })
      let whisperCli: LocalSetupResult | undefined
      if (WHISPER_CPP_MODEL_IDS.includes(modelId)) {
        const { ensureWhisperCliSetupResult } = await import('./models/stt-engine')
        whisperCli = await ensureWhisperCliSetupResult()
      }
      sender.send('models:download-complete', { modelId, success: true, whisperCli })
      return true
    } catch (err: any) {
      sender.send('models:download-complete', { modelId, success: false, error: err.message })
      return false
    }
  })
  ipcMain.handle('models:cancel-download', (_e, modelId: string) => { cancelDownload(modelId); return true })
  ipcMain.handle('models:delete', (_e, modelId: string) => { deleteModel(modelId); return true })
  ipcMain.handle('models:list', () => listDownloadedModels())
  ipcMain.handle('models:check-mlx-whisper', async () => {
    const { checkMLXWhisperAvailable } = await import('./models/stt-engine')
    return checkMLXWhisperAvailable()
  })
  ipcMain.handle('models:install-mlx-whisper', async () => {
    const { installMLXWhisper } = await import('./models/stt-engine')
    return installMLXWhisper()
  })
  ipcMain.handle('models:check-mlx-whisper-8bit', async () => {
    const { checkMLXWhisper8BitAvailable } = await import('./models/stt-engine')
    return checkMLXWhisper8BitAvailable()
  })
  ipcMain.handle('models:install-mlx-whisper-8bit', async () => {
    const { installMLXWhisper8Bit } = await import('./models/stt-engine')
    return installMLXWhisper8Bit()
  })
  ipcMain.handle('models:check-ffmpeg', async () => {
    const { checkFfmpegAvailable } = await import('./models/stt-engine')
    return checkFfmpegAvailable()
  })
  ipcMain.handle('models:install-ffmpeg', async () => {
    const { installFfmpeg } = await import('./models/stt-engine')
    return installFfmpeg()
  })
  ipcMain.handle('models:repair-mlx-whisper', async () => {
    const { repairMLXWhisper } = await import('./models/stt-engine')
    return repairMLXWhisper()
  })
  ipcMain.handle('models:repair-mlx-whisper-8bit', async () => {
    const { repairMLXWhisper8Bit } = await import('./models/stt-engine')
    return repairMLXWhisper8Bit()
  })
  ipcMain.handle('models:uninstall-mlx-whisper', async () => {
    const { uninstallMLXWhisper } = await import('./models/stt-engine')
    return uninstallMLXWhisper()
  })
  ipcMain.handle('models:uninstall-mlx-whisper-8bit', async () => {
    const { uninstallMLXWhisper8Bit } = await import('./models/stt-engine')
    return uninstallMLXWhisper8Bit()
  })

  // --- Parakeet TDT (onnx-asr) ---
  ipcMain.handle('models:check-parakeet', async () => {
    try {
      const { execSync } = await import('child_process')
      execSync('python3 -c "import onnx_asr"', { timeout: 10000, stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('models:install-parakeet', async () => {
    const steps: { step: string; ok: boolean; detail?: string }[] = []
    try {
      const { execSync } = await import('child_process')
      // Step 1: check python3
      try {
        execSync('python3 --version', { timeout: 5000, stdio: 'pipe' })
        steps.push({ step: 'Python 3 check', ok: true })
      } catch {
        steps.push({ step: 'Python 3 check', ok: false, detail: 'python3 not found. Install Python 3 from python.org or brew install python3' })
        return { ok: false, steps, error: 'Python 3 not found' }
      }
      // Step 2: pip install onnx-asr
      try {
        execSync('python3 -m pip install --user onnx-asr', { timeout: 120000, stdio: 'pipe' })
        steps.push({ step: 'Install onnx-asr', ok: true })
      } catch (err: any) {
        const msg = err?.stderr?.toString?.()?.slice(0, 200) || ''
        if (msg.includes('externally-managed')) {
          // PEP 668 — try --break-system-packages
          try {
            execSync('python3 -m pip install --user --break-system-packages onnx-asr', { timeout: 120000, stdio: 'pipe' })
            steps.push({ step: 'Install onnx-asr (PEP 668 workaround)', ok: true })
          } catch (e2: any) {
            steps.push({ step: 'Install onnx-asr', ok: false, detail: e2?.stderr?.toString?.()?.slice(0, 200) || 'pip install failed' })
            return { ok: false, steps, error: 'pip install onnx-asr failed' }
          }
        } else {
          steps.push({ step: 'Install onnx-asr', ok: false, detail: msg || 'pip install failed' })
          return { ok: false, steps, error: 'pip install onnx-asr failed' }
        }
      }
      // Step 3: verify import
      try {
        execSync('python3 -c "import onnx_asr; print(\'OK\')"', { timeout: 10000, stdio: 'pipe' })
        steps.push({ step: 'Verify onnx-asr', ok: true })
      } catch {
        steps.push({ step: 'Verify onnx-asr', ok: false, detail: 'Import check failed after install' })
        return { ok: false, steps, error: 'onnx-asr installed but import failed' }
      }
      return { ok: true, steps }
    } catch (err: any) {
      return { ok: false, steps, error: err.message?.slice(0, 200) || 'Unknown error' }
    }
  })

  // --- Ollama ---
  ipcMain.handle('ollama:detect', async () => {
    const { detectOllama } = await import('./models/ollama-manager')
    return detectOllama()
  })
  ipcMain.handle('ollama:models', async () => {
    const { getOllamaModelsForPicker } = await import('./models/ollama-manager')
    return getOllamaModelsForPicker()
  })
  ipcMain.handle('ollama:recommended-tier', async () => {
    const { getRecommendedTier, getSystemRAMGB } = await import('./models/ollama-manager')
    return { tier: getRecommendedTier(), ramGB: getSystemRAMGB() }
  })
  ipcMain.handle('ollama:pull', async (_e, modelTag: string) => {
    const { pullOllamaModel } = await import('./models/ollama-manager')
    const sender = _e.sender
    await pullOllamaModel(modelTag, (progress) => {
      sender.send('ollama:pull-progress', { modelTag, ...progress })
    })
    return true
  })
  ipcMain.handle('ollama:health', async () => {
    const { ollamaHealthCheck } = await import('./models/ollama-manager')
    return ollamaHealthCheck()
  })

  // --- Tray / Meeting ---
  ipcMain.handle('tray:update-recording', (_e, isRecording: boolean) => {
    updateTrayRecordingState(isRecording)
  })
  ipcMain.handle('tray:update-meeting-info', (_e, info: { title: string; startTime: number } | null) => {
    updateTrayMeetingInfo(info)
  })
  ipcMain.handle('meeting:set-calendar-events', (_e, events: Array<{ id: string; title: string; start: number; end: number; joinLink?: string }>) => {
    setCalendarEvents(events)
    return true
  })

  // --- Recording ---

  ipcMain.handle('recording:start', async (_e, options: any) => {
    const sender = _e.sender
    updateTrayRecordingState(true)
    return startRecording(
      options,
      (chunk) => { sender.send('recording:transcript-chunk', chunk) },
      (status) => { sender.send('recording:status', status) },
      (corrected) => { sender.send('recording:transcript-corrected', corrected) }
    )
  })
  ipcMain.handle('recording:stop', async () => { updateTrayRecordingState(false); return stopRecording() })
  ipcMain.handle('recording:pause', () => { pauseRecording(); updateTrayRecordingState(false); return true })
  ipcMain.handle('recording:resume', (_e, options?: { sttModel?: string }) => { resumeRecording(options); updateTrayRecordingState(true); return true })
  ipcMain.handle('recording:audio-chunk', async (_e, pcmData: any, channel?: number) => {
    let data: Float32Array
    if (pcmData instanceof Float32Array) {
      data = pcmData
    } else if (pcmData?.buffer instanceof ArrayBuffer) {
      data = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 4)
    } else if (ArrayBuffer.isView(pcmData)) {
      data = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 4)
    } else {
      data = new Float32Array(pcmData)
    }
    return processAudioChunk(data, channel ?? 0)
  })

  // --- LLM ---
  ipcMain.handle('llm:summarize', async (_e, data: any) => {
    return summarize(
      data.transcript,
      data.personalNotes,
      data.model,
      data.meetingTemplateId,
      data.customPrompt,
      data.meetingTitle,
      data.meetingDuration,
      data.attendees,
      data.accountDisplayName,
    )
  })
  ipcMain.handle('llm:chat', async (_e, data: any) => {
    const sender = _e.sender
    return chat(data.messages, data.context, data.model, (chunk) => {
      sender.send('llm:chat-chunk', chunk)
    })
  })

  // Build rich graph context for Syag Chat (people, projects, decisions, commitments + notes)
  ipcMain.handle('llm:build-graph-context', async () => {
    try {
      const { getAllPeople } = await import('./memory/people-store')
      const { getAllProjects } = await import('./memory/project-store')
      const { getAllDecisions } = await import('./memory/decision-store')
      const { getOpenCommitments } = await import('./memory/commitment-store')
      const parts: string[] = []

      const people = getAllPeople()
      if (people.length > 0) {
        parts.push(`People (${people.length}):`)
        for (const p of people.slice(0, 30)) {
          parts.push(`  - ${p.name}${p.company ? ` (${p.company})` : ''}${p.role ? `, ${p.role}` : ''} — ${p.meetingCount || 0} meetings`)
        }
      }

      const projects = getAllProjects()
      if (projects.length > 0) {
        parts.push(`\nProjects (${projects.length}):`)
        for (const p of projects.slice(0, 15)) {
          parts.push(`  - ${p.name} [${p.status}] — ${p.meetingCount || 0} meetings, ${p.decisionCount || 0} decisions`)
        }
      }

      const decisions = getAllDecisions()
      if (decisions.length > 0) {
        parts.push(`\nRecent decisions (${decisions.length}):`)
        for (const d of decisions.slice(0, 20)) {
          parts.push(`  - ${d.text}${d.project_name ? ` (${d.project_name})` : ''}${d.note_title ? ` from "${d.note_title}"` : ''}`)
        }
      }

      const commitments = getOpenCommitments()
      if (commitments.length > 0) {
        parts.push(`\nOpen commitments (${commitments.length}):`)
        for (const c of commitments.slice(0, 15)) {
          const owner = c.owner === 'you' ? 'You' : (c.assignee_name || c.owner)
          parts.push(`  - ${owner}: ${c.text}${c.due_date ? ` (due ${c.due_date})` : ''}`)
        }
      }

      return parts.join('\n')
    } catch (err: any) {
      console.error('[llm:build-graph-context]', err)
      return ''
    }
  })

  // --- Audio ---
  ipcMain.handle('audio:get-devices', async () => {
    return [] // Devices are enumerated in the renderer via navigator.mediaDevices
  })
  ipcMain.handle('audio:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })
    return sources.map(s => ({ id: s.id, name: s.name }))
  })

  // --- Permissions ---
  ipcMain.handle('permissions:check-mic', () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('microphone')
    }
    return 'granted'
  })
  ipcMain.handle('permissions:request-mic', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.askForMediaAccess('microphone')
    }
    return true
  })
  ipcMain.handle('permissions:check-screen', () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen')
    }
    return 'granted'
  })
  ipcMain.handle('permissions:request-screen', () => {
    // macOS screen recording permission can only be triggered by actually using
    // desktopCapturer; the OS prompts automatically. We return the current status.
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen')
    }
    return 'granted'
  })

  // --- Keychain ---
  ipcMain.handle('keychain:get', (_e, service: string) => {
    const chain = loadKeychain()
    return chain[service] ?? null
  })
  ipcMain.handle('keychain:set', (_e, service: string, value: string) => {
    const chain = loadKeychain()
    chain[service] = value
    saveKeychain(chain)
    return true
  })
  ipcMain.handle('keychain:delete', (_e, service: string) => {
    const chain = loadKeychain()
    delete chain[service]
    saveKeychain(chain)
    return true
  })

  // --- Optional providers (enabled via userData/optional-providers/; not in repo) ---
  ipcMain.handle('app:get-optional-providers', () => getOptionalProviders())

  // --- Calendar / URL Fetch ---
  ipcMain.handle('fetch:url', async (_e, url: string) => {
    try {
      const { statusCode, data } = await netFetch(url, { method: 'GET' })
      return { ok: statusCode < 400, status: statusCode, body: data }
    } catch (err: any) {
      return { ok: false, status: 0, body: err.message || 'Network error' }
    }
  })

  // --- Export ---
  ipcMain.handle('export:docx', async (_e, noteData: any) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No active window' }
      const { dialog } = await import('electron')
      const result = await dialog.showSaveDialog(win, {
        title: 'Export as Word Document',
        defaultPath: `${(noteData.title || 'Meeting Notes').replace(/[/\\?%*:|"<>]/g, '-')}.docx`,
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' }
      const { exportToDocx } = await import('./export/docx-exporter')
      await exportToDocx(noteData, result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err: any) {
      console.error('[export:docx]', err)
      return { ok: false, error: err.message || 'Export failed' }
    }
  })

  ipcMain.handle('export:pdf', async (_e, noteData: any) => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No active window' }
      const { dialog } = await import('electron')
      const result = await dialog.showSaveDialog(win, {
        title: 'Export as PDF',
        defaultPath: `${(noteData.title || 'Meeting Notes').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled' }
      const { exportToPdf } = await import('./export/pdf-exporter')
      await exportToPdf(noteData, result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err: any) {
      console.error('[export:pdf]', err)
      return { ok: false, error: err.message || 'Export failed' }
    }
  })

  // --- Obsidian vault export ---
  // v2: Enhanced vault writer with YAML frontmatter, wikilinks, people markdown,
  //     conflict detection, and obsidian:// deep links.
  //
  //  VAULT WRITE FLOW:
  //  noteData ──▶ validate vault path ──▶ build frontmatter + body
  //       │              │                        │
  //       ▼              ▼                        ▼
  //  [no vault?]   [invalid?]              write meetings/{file}.md
  //  show dialog   show error                     │
  //                                    ┌──────────┴──────────┐
  //                                    ▼                     ▼
  //                              [no conflict]         [conflict]
  //                              write directly       write as -v2
  //                                    │                     │
  //                                    └──────────┬──────────┘
  //                                               ▼
  //                                  update people/*.md files
  //                                               │
  //                                               ▼
  //                                  return { ok, path, obsidianUri }
  ipcMain.handle('export:obsidian', async (_e, noteData: any) => {
    try {
      const { getVaultPath, setVaultPath, validateVaultPath, isVaultConfigured, buildVaultNotePath, buildObsidianUri } = await import('./vault/vault-config')
      const { updatePeopleMdForNote } = await import('./vault/people-md')
      const { updateProjectMd } = await import('./vault/projects-md')
      const { getNotePeople } = await import('./memory/people-store')
      const { getProjectsForNote } = await import('./memory/project-store')
      const { createHash } = await import('crypto')
      const { homedir } = await import('os')

      let vaultPath = getVaultPath()

      // If no vault configured, or vault path invalid, show folder picker
      if (!vaultPath || !validateVaultPath(vaultPath).valid) {
        const win = BrowserWindow.getFocusedWindow()
        if (!win) return { ok: false, error: 'No active window' }
        const { dialog } = await import('electron')
        const result = await dialog.showOpenDialog(win, {
          title: 'Select Obsidian Vault Folder',
          defaultPath: vaultPath || app.getPath('home'),
          properties: ['openDirectory'],
        })
        if (result.canceled || !result.filePaths.length) return { ok: false, error: 'Cancelled' }
        vaultPath = result.filePaths[0]
        const validation = validateVaultPath(vaultPath)
        if (!validation.valid) return { ok: false, error: validation.error }
        setVaultPath(vaultPath)
      }

      // Resolve ~ in vault path
      const resolvedVault = vaultPath.startsWith('~') ? vaultPath.replace('~', homedir()) : vaultPath

      // Build relative path for the note
      const noteDate = noteData.date || new Date().toISOString().slice(0, 10)
      const noteTitle = noteData.title || 'Untitled Meeting'
      const noteId = noteData.id || 'unknown'
      const relativePath = buildVaultNotePath(noteDate, noteTitle, noteId)
      const absolutePath = join(resolvedVault, relativePath)

      // Ensure meetings/ directory exists
      mkdirSync(dirname(absolutePath), { recursive: true })

      // Build YAML frontmatter with wikilinks
      const people = noteData.id ? getNotePeople(noteData.id) : []
      const peopleWikilinks = people.map((p: any) => `  - "[[${p.name}]]"`)
      const noteProjects = noteData.id ? getProjectsForNote(noteData.id) : []

      const frontmatter: string[] = []
      frontmatter.push('---')
      frontmatter.push(`id: syag-${(noteId).slice(0, 12)}`)
      frontmatter.push(`date: ${noteDate}`)
      if (noteData.time) frontmatter.push(`time: "${noteData.time}"`)
      frontmatter.push(`title: "${noteTitle.replace(/"/g, '\\"')}"`)
      if (noteData.duration) frontmatter.push(`duration: "${noteData.duration}"`)
      if (peopleWikilinks.length > 0) {
        frontmatter.push('people:')
        frontmatter.push(...peopleWikilinks)
      }
      if (noteProjects.length > 0) {
        frontmatter.push(`project: "[[${noteProjects[0].name}]]"`)
      }
      frontmatter.push('tags: [meeting, syag]')
      frontmatter.push('---')

      // Build markdown body using shared function
      // We construct a minimal note-like object for buildMarkdownBody
      const bodyParts: string[] = []
      const summary = noteData.summary
      if (summary) {
        if (summary.overview) { bodyParts.push('## Summary', '', summary.overview) }
        if (summary.keyPoints?.length) {
          bodyParts.push('', '## Key Points')
          summary.keyPoints.forEach((kp: string) => bodyParts.push(`- ${kp}`))
        }
        if (summary.discussionTopics?.length) {
          bodyParts.push('', '## Discussion Topics')
          for (const topic of summary.discussionTopics) {
            bodyParts.push(`### ${topic.topic}`)
            if (topic.speakers?.length) bodyParts.push(`*Speakers: ${topic.speakers.join(', ')}*`)
            if (topic.summary) bodyParts.push(topic.summary)
          }
        }
        if (summary.decisions?.length) {
          bodyParts.push('', '## Decisions')
          summary.decisions.forEach((d: string) => bodyParts.push(`- ${d}`))
        }
        const actionItems = summary.actionItems || summary.nextSteps
        if (actionItems?.length) {
          bodyParts.push('', '## Action Items')
          for (const ai of actionItems) {
            const check = ai.done ? '[x]' : '[ ]'
            const assignee = ai.assignee && ai.assignee !== 'Unassigned' ? ` — ${ai.assignee}` : ''
            const due = ai.dueDate ? ` (by ${ai.dueDate})` : ''
            bodyParts.push(`- ${check} ${ai.text}${assignee}${due}`)
          }
        }
        if (summary.questionsAndOpenItems?.length) {
          bodyParts.push('', '## Open Questions')
          summary.questionsAndOpenItems.forEach((q: string) => bodyParts.push(`- ${q}`))
        }
        if (summary.keyQuotes?.length) {
          bodyParts.push('', '## Key Quotes')
          summary.keyQuotes.forEach((q: any) => bodyParts.push(`> "${q.text}" — *${q.speaker}*`, ''))
        }
      }
      if (noteData.personalNotes?.trim()) {
        bodyParts.push('', '## Personal Notes', noteData.personalNotes.trim())
      }
      if (noteData.transcript?.length) {
        bodyParts.push('', '## Transcript')
        for (const t of noteData.transcript) { bodyParts.push(`**[${t.time}] ${t.speaker}:** ${t.text}`, '') }
      }

      const fullContent = frontmatter.join('\n') + '\n\n' + bodyParts.join('\n')

      // Conflict detection
      let finalPath = absolutePath
      if (existsSync(absolutePath)) {
        const existingContent = readFileSync(absolutePath, 'utf-8')
        const existingHash = createHash('sha256').update(existingContent).digest('hex')
        const newHash = createHash('sha256').update(fullContent).digest('hex')
        if (existingHash === newHash) {
          // Idempotent — content unchanged, return success without rewriting
          const obsidianUri = buildObsidianUri(relativePath)
          return { ok: true, path: absolutePath, obsidianUri, skipped: true }
        }
        // Conflict: different content — write as -v2
        finalPath = absolutePath.replace(/\.md$/, '-v2.md')
        // If -v2 also exists, find next available suffix
        let suffix = 2
        while (existsSync(finalPath)) {
          suffix++
          finalPath = absolutePath.replace(/\.md$/, `-v${suffix}.md`)
        }
      }

      writeFileSync(finalPath, fullContent, 'utf-8')

      // Update people markdown files
      const meeting = { date: noteDate, title: noteTitle }
      if (people.length > 0) {
        updatePeopleMdForNote(
          people.map((p: any) => ({ name: p.name, email: p.email, company: p.company, role: p.role })),
          meeting
        )
      }

      // Update project markdown files
      if (noteData.id) {
        try {
          const projects = getProjectsForNote(noteData.id)
          for (const proj of projects) {
            updateProjectMd({ name: proj.name, description: proj.description, status: proj.status }, meeting)
          }
        } catch (err) {
          console.error('[export:obsidian] Project vault files failed:', err)
        }
      }

      // Build obsidian URI
      const finalRelativePath = finalPath.slice(resolvedVault.length + 1)
      const obsidianUri = buildObsidianUri(finalRelativePath)

      console.log(`[export:obsidian] Wrote vault note: ${finalPath}`)
      return { ok: true, path: finalPath, obsidianUri, conflict: finalPath !== absolutePath }
    } catch (err: any) {
      console.error('[export:obsidian]', err)
      return { ok: false, error: err.message || 'Export failed' }
    }
  })

  // --- Vault config ---
  ipcMain.handle('vault:get-config', async () => {
    const { getVaultPath, isVaultConfigured, getVaultName, validateVaultPath } = await import('./vault/vault-config')
    const path = getVaultPath()
    return {
      configured: isVaultConfigured(),
      path,
      vaultName: getVaultName(),
      validation: path ? validateVaultPath(path) : null,
    }
  })

  ipcMain.handle('vault:pick-folder', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No active window' }
      const { dialog } = await import('electron')
      const { getVaultPath, setVaultPath, validateVaultPath, getVaultName } = await import('./vault/vault-config')
      const currentPath = getVaultPath()
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Obsidian Vault Folder',
        defaultPath: currentPath || app.getPath('home'),
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths.length) return { ok: false, error: 'Cancelled' }
      const chosenPath = result.filePaths[0]
      const validation = validateVaultPath(chosenPath)
      if (!validation.valid) return { ok: false, error: validation.error }
      setVaultPath(chosenPath)
      return { ok: true, path: chosenPath, vaultName: getVaultName(), warning: validation.warning }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('vault:set-path', async (_e, path: string) => {
    const { setVaultPath, validateVaultPath } = await import('./vault/vault-config')
    const validation = validateVaultPath(path)
    if (!validation.valid) return { ok: false, error: validation.error }
    setVaultPath(path)
    return { ok: true, warning: validation.warning }
  })

  // --- Slack ---
  ipcMain.handle('slack:test-webhook', async (_e, webhookUrl: string) => {
    try {
      const { statusCode } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ Syag Note connected successfully!' }),
      })
      return { ok: statusCode === 200 }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' }
    }
  })
  ipcMain.handle('slack:send-summary', async (_e, webhookUrl: string, payload: any) => {
    try {
      const { statusCode, data } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: statusCode === 200, error: statusCode !== 200 ? data : undefined }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Send failed' }
    }
  })

  // --- Microsoft Teams ---
  ipcMain.handle('teams:test-webhook', async (_e, webhookUrl: string) => {
    try {
      const payload = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [{ type: 'TextBlock', text: '✅ Syag Note connected successfully!', weight: 'Bolder', wrap: true }],
          },
        }],
      }
      const { statusCode } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: statusCode >= 200 && statusCode < 300 }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Connection failed' }
    }
  })
  ipcMain.handle('teams:send-summary', async (_e, webhookUrl: string, payload: any) => {
    try {
      const { statusCode, data } = await netFetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: statusCode >= 200 && statusCode < 300, error: statusCode >= 300 ? data : undefined }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Send failed' }
    }
  })

  // --- Google Calendar OAuth ---
  ipcMain.handle('google:calendar-auth', async (_e, clientId: string) => {
    try {
      const { startGoogleOAuth } = await import('./integrations/google-auth')
      return startGoogleOAuth(clientId)
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('google:calendar-fetch', async (_e, accessToken: string, range?: { daysPast?: number; daysAhead?: number }) => {
    try {
      const { fetchGoogleCalendarEvents } = await import('./integrations/google-calendar')
      return fetchGoogleCalendarEvents(accessToken, 'primary', range ?? { daysPast: 30, daysAhead: 30 })
    } catch (err: any) {
      return { ok: false, events: [], error: err.message }
    }
  })
  ipcMain.handle('google:calendar-refresh', async (_e, clientId: string, refreshToken: string) => {
    try {
      const { refreshGoogleToken } = await import('./integrations/google-auth')
      return refreshGoogleToken(clientId, refreshToken)
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // --- Microsoft Teams / Outlook Calendar OAuth ---
  ipcMain.handle('microsoft:calendar-auth', async (_e, clientId: string) => {
    try {
      const { startMicrosoftOAuth } = await import('./integrations/microsoft-auth')
      return startMicrosoftOAuth(clientId)
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('microsoft:calendar-fetch', async (_e, accessToken: string, range?: { daysPast?: number; daysAhead?: number }) => {
    try {
      const { fetchMicrosoftCalendarEvents } = await import('./integrations/microsoft-calendar')
      const events = await fetchMicrosoftCalendarEvents(accessToken, range ?? { daysPast: 30, daysAhead: 30 })
      return { ok: true, events }
    } catch (err: any) {
      return { ok: false, events: [], error: err.message }
    }
  })
  ipcMain.handle('microsoft:calendar-refresh', async (_e, clientId: string, refreshToken: string) => {
    try {
      const { refreshMicrosoftToken } = await import('./integrations/microsoft-auth')
      return refreshMicrosoftToken(clientId, refreshToken)
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('calendar-local-blocks:list', () => getAllLocalCalendarBlocks())
  ipcMain.handle('calendar-local-blocks:add', (_e, block: { id: string; title: string; startIso: string; endIso: string; noteId?: string | null }) => {
    addLocalCalendarBlock(block)
    return true
  })
  ipcMain.handle('calendar-local-blocks:delete', (_e, id: string) => {
    deleteLocalCalendarBlock(id)
    return true
  })

  ipcMain.handle('tray-agenda:set-cache', (_e, events: unknown) => {
    setTrayAgendaCache(Array.isArray(events) ? (events as any) : [])
    return true
  })
  ipcMain.handle('tray-agenda:get-cache', () => getTrayAgendaCache())
  ipcMain.handle('tray-agenda:show-main', () => {
    showMainWindowCalendar()
    return true
  })
  ipcMain.handle('tray-agenda:show-settings', () => {
    showMainWindowSettings()
    return true
  })
  ipcMain.handle('tray-agenda:go-to-app', () => {
    showMainWindowApp()
    return true
  })
  ipcMain.handle('tray-agenda:new-note', () => {
    startNewNoteFromTrayAgenda()
    return true
  })
  ipcMain.handle('tray-agenda:quit', () => {
    quitFromTrayAgenda()
    return true
  })
  ipcMain.handle(
    'tray-agenda:activate-event',
    (_e, payload: { noteId?: string | null; eventId?: string; title?: string; openMode: 'note' | 'calendar' }) => {
      openNoteOrNewMeetingFromTray(payload)
      return true
    }
  )

  // --- Contacts Import ---
  ipcMain.handle('contacts:import-vcf', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No active window' }
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog(win, {
        title: 'Import Contacts (VCF)',
        filters: [{ name: 'vCard', extensions: ['vcf'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths.length) return { ok: false, error: 'Cancelled' }
      const { importVCFFile } = await import('./integrations/contacts-import')
      const importResult = importVCFFile(result.filePaths[0])
      return { ok: true, ...importResult }
    } catch (err: any) {
      console.error('[contacts:import-vcf]', err)
      return { ok: false, error: err.message || 'Import failed' }
    }
  })

  // --- Jira ---
  ipcMain.handle('jira:test-token', async (_e, siteUrl: string, email: string, apiToken: string) => {
    const { testJiraTokenConnection } = await import('./integrations/jira-auth')
    return testJiraTokenConnection(siteUrl, email, apiToken)
  })
  ipcMain.handle('jira:get-projects', async (_e, configJson: string) => {
    const { getJiraProjects } = await import('./integrations/jira-api')
    return getJiraProjects(JSON.parse(configJson))
  })
  ipcMain.handle('jira:get-issue-types', async (_e, configJson: string, projectKey: string) => {
    const { getJiraIssueTypes } = await import('./integrations/jira-api')
    return getJiraIssueTypes(JSON.parse(configJson), projectKey)
  })
  ipcMain.handle('jira:search-users', async (_e, configJson: string, query: string) => {
    const { searchJiraUsers } = await import('./integrations/jira-api')
    return searchJiraUsers(JSON.parse(configJson), query)
  })
  ipcMain.handle('jira:create-issue', async (_e, configJson: string, issueData: any) => {
    const { createJiraIssue } = await import('./integrations/jira-api')
    return createJiraIssue(JSON.parse(configJson), issueData)
  })
  ipcMain.handle('jira:bulk-create', async (_e, configJson: string, issues: any[]) => {
    const { bulkCreateJiraIssues } = await import('./integrations/jira-api')
    return bulkCreateJiraIssues(JSON.parse(configJson), issues)
  })
  ipcMain.handle('jira:get-issue', async (_e, configJson: string, issueKey: string) => {
    const { getJiraIssue } = await import('./integrations/jira-api')
    return getJiraIssue(JSON.parse(configJson), issueKey)
  })

  // --- Memory (People, Commitments, Topics) ---
  ipcMain.handle('memory:people-get-all', async () => {
    const { getAllPeople } = await import('./memory/people-store')
    return getAllPeople()
  })
  ipcMain.handle('memory:people-get', async (_e, id: string) => {
    const { getPerson } = await import('./memory/people-store')
    return getPerson(id)
  })
  ipcMain.handle('memory:people-upsert', async (_e, data: any) => {
    const { upsertPerson } = await import('./memory/people-store')
    return upsertPerson(data)
  })
  ipcMain.handle('memory:people-delete', async (_e, id: string) => {
    const { deletePerson } = await import('./memory/people-store')
    return deletePerson(id)
  })
  // Full "Forget this person" — cascade delete from all tables + vault
  ipcMain.handle('memory:people-forget', async (_e, id: string) => {
    try {
      const { getPerson, deletePerson } = await import('./memory/people-store')
      const person = getPerson(id)
      if (!person) return false
      // Delete from decisions
      const { getDb } = await import('./storage/database')
      const db = getDb()
      db.prepare('DELETE FROM decision_people WHERE person_id = ?').run(id)
      // Delete vault people file if it exists
      try {
        const { getVaultPath } = await import('./vault/vault-config')
        const { existsSync, unlinkSync } = await import('fs')
        const { join } = await import('path')
        const { homedir } = await import('os')
        const vaultPath = getVaultPath()
        if (vaultPath) {
          const resolved = vaultPath.startsWith('~') ? vaultPath.replace('~', homedir()) : vaultPath
          const filePath = join(resolved, 'people', `${person.name.replace(/[/\\?%*:|"<>]/g, '-')}.md`)
          if (existsSync(filePath)) unlinkSync(filePath)
        }
      } catch { /* vault not configured — ok */ }
      // Delete the person (cascades note_people, nulls commitments.assignee_id)
      deletePerson(id)
      console.log(`[privacy] Forgot person: ${person.name} (${id})`)
      return true
    } catch (err: any) {
      console.error('[privacy:forget]', err)
      return false
    }
  })
  ipcMain.handle('memory:people-merge', async (_e, keepId: string, mergeId: string) => {
    const { mergePeople } = await import('./memory/people-store')
    return mergePeople(keepId, mergeId)
  })
  ipcMain.handle('memory:people-get-meetings', async (_e, personId: string) => {
    const { getPersonMeetings } = await import('./memory/people-store')
    return getPersonMeetings(personId)
  })
  ipcMain.handle('memory:people-for-note', async (_e, noteId: string) => {
    const { getNotePeople } = await import('./memory/people-store')
    return getNotePeople(noteId)
  })
  ipcMain.handle('memory:commitments-get-all', async (_e, filters?: any) => {
    const { getAllCommitments } = await import('./memory/commitment-store')
    return getAllCommitments(filters)
  })
  ipcMain.handle('memory:commitments-for-note', async (_e, noteId: string) => {
    const { getCommitmentsForNote } = await import('./memory/commitment-store')
    return getCommitmentsForNote(noteId)
  })
  ipcMain.handle('memory:commitments-open', async () => {
    const { getOpenCommitments } = await import('./memory/commitment-store')
    return getOpenCommitments()
  })
  ipcMain.handle('memory:commitments-add', async (_e, data: any) => {
    const { addCommitment } = await import('./memory/commitment-store')
    return addCommitment(data)
  })
  ipcMain.handle('memory:commitments-update-status', async (_e, id: string, status: string) => {
    const { updateCommitmentStatus } = await import('./memory/commitment-store')
    return updateCommitmentStatus(id, status as any)
  })
  ipcMain.handle('memory:commitments-update', async (_e, id: string, data: any) => {
    const { updateCommitment } = await import('./memory/commitment-store')
    return updateCommitment(id, data)
  })
  ipcMain.handle('memory:people-update', async (_e, id: string, data: any) => {
    const { updatePerson } = await import('./memory/people-store')
    return updatePerson(id, data)
  })
  ipcMain.handle('memory:people-unlink-from-note', async (_e, noteId: string, personId: string) => {
    const { unlinkPersonFromNote } = await import('./memory/people-store')
    return unlinkPersonFromNote(noteId, personId)
  })
  ipcMain.handle('memory:people-link-to-note', async (_e, noteId: string, personId: string, role?: string) => {
    const { linkPersonToNote } = await import('./memory/people-store')
    linkPersonToNote(noteId, personId, role)
    return true
  })
  ipcMain.handle('memory:topics-get-all', async () => {
    const { getAllTopics } = await import('./memory/topic-store')
    return getAllTopics()
  })
  ipcMain.handle('memory:topics-for-note', async (_e, noteId: string) => {
    const { getNoteTopics } = await import('./memory/topic-store')
    return getNoteTopics(noteId)
  })
  ipcMain.handle('memory:topics-add-to-note', async (_e, noteId: string, label: string) => {
    const { upsertTopic, linkTopicToNote } = await import('./memory/topic-store')
    const topic = upsertTopic(label)
    linkTopicToNote(noteId, topic.id)
    return topic
  })
  ipcMain.handle('memory:topics-unlink-from-note', async (_e, noteId: string, topicId: string) => {
    const { unlinkTopicFromNote } = await import('./memory/topic-store')
    return unlinkTopicFromNote(noteId, topicId)
  })
  ipcMain.handle('memory:topics-update-label', async (_e, id: string, label: string) => {
    const { updateTopicLabel } = await import('./memory/topic-store')
    return updateTopicLabel(id, label)
  })
  // --- Projects ---
  ipcMain.handle('memory:projects-get-all', async (_e, filters?: { status?: string }) => {
    const { getAllProjects } = await import('./memory/project-store')
    return getAllProjects(filters)
  })
  ipcMain.handle('memory:projects-get', async (_e, id: string) => {
    const { getProject } = await import('./memory/project-store')
    return getProject(id)
  })
  ipcMain.handle('memory:projects-for-note', async (_e, noteId: string) => {
    const { getProjectsForNote } = await import('./memory/project-store')
    return getProjectsForNote(noteId)
  })
  ipcMain.handle('memory:projects-confirm', async (_e, id: string) => {
    const { confirmProject } = await import('./memory/project-store')
    return confirmProject(id)
  })
  ipcMain.handle('memory:projects-archive', async (_e, id: string) => {
    const { archiveProject } = await import('./memory/project-store')
    return archiveProject(id)
  })
  ipcMain.handle('memory:projects-create', async (_e, name: string) => {
    const { upsertProject, confirmProject } = await import('./memory/project-store')
    const project = upsertProject(name)
    if (project) confirmProject(project.id) // User-created = immediately active
    return project
  })
  ipcMain.handle('memory:projects-update', async (_e, id: string, data: any) => {
    const { updateProject } = await import('./memory/project-store')
    return updateProject(id, data)
  })
  ipcMain.handle('memory:projects-delete', async (_e, id: string) => {
    const { deleteProject } = await import('./memory/project-store')
    return deleteProject(id)
  })
  ipcMain.handle('memory:projects-merge', async (_e, keepId: string, mergeId: string) => {
    const { mergeProjects } = await import('./memory/project-store')
    return mergeProjects(keepId, mergeId)
  })
  ipcMain.handle('memory:projects-timeline', async (_e, projectId: string) => {
    const { getProjectTimeline } = await import('./memory/project-store')
    return getProjectTimeline(projectId)
  })

  // --- Decisions ---
  ipcMain.handle('memory:decisions-for-note', async (_e, noteId: string) => {
    const { getDecisionsForNote } = await import('./memory/decision-store')
    return getDecisionsForNote(noteId)
  })
  ipcMain.handle('memory:decisions-for-project', async (_e, projectId: string) => {
    const { getDecisionsForProject } = await import('./memory/decision-store')
    return getDecisionsForProject(projectId)
  })
  ipcMain.handle('memory:decisions-get-all', async (_e, filters?: any) => {
    const { getAllDecisions } = await import('./memory/decision-store')
    return getAllDecisions(filters)
  })

  ipcMain.handle('memory:extract-entities', async (_e, data: { noteId: string; summary: any; transcript: any[]; model: string; calendarAttendees?: any[]; calendarTitle?: string }) => {
    try {
      const { extractEntities, storeExtractedEntities } = await import('./memory/entity-extractor')
      const entities = await extractEntities(data.summary, data.transcript, data.model, data.calendarAttendees?.map((a: any) => a.email).filter(Boolean))
      const result = await storeExtractedEntities(data.noteId, entities, data.calendarAttendees, data.calendarTitle)
      return { ok: true, ...result }
    } catch (err: any) {
      console.error('[memory:extract-entities]', err)
      return { ok: false, error: err.message || 'Entity extraction failed' }
    }
  })

  // --- Routines ---
  ipcMain.handle('routines:get-all', async () => {
    const { getAllRoutines } = await import('./routines/routines-engine')
    return getAllRoutines()
  })
  ipcMain.handle('routines:get', async (_e, id: string) => {
    const { getRoutine } = await import('./routines/routines-engine')
    return getRoutine(id)
  })
  ipcMain.handle('routines:create', async (_e, data: any) => {
    const { createRoutine, rescheduleAllRoutines } = await import('./routines/routines-engine')
    const result = createRoutine(data)
    rescheduleAllRoutines()
    return result
  })
  ipcMain.handle('routines:update', async (_e, id: string, data: any) => {
    const { updateRoutine, rescheduleAllRoutines } = await import('./routines/routines-engine')
    updateRoutine(id, data)
    rescheduleAllRoutines()
    return true
  })
  ipcMain.handle('routines:delete', async (_e, id: string) => {
    const { deleteRoutine, rescheduleAllRoutines } = await import('./routines/routines-engine')
    const ok = deleteRoutine(id)
    rescheduleAllRoutines()
    return ok
  })
  ipcMain.handle('routines:toggle', async (_e, id: string, enabled: boolean) => {
    const { toggleRoutine, rescheduleAllRoutines } = await import('./routines/routines-engine')
    toggleRoutine(id, enabled)
    rescheduleAllRoutines()
    return true
  })
  ipcMain.handle('routines:run-now', async (_e, id: string) => {
    const { getRoutine, executeRoutine } = await import('./routines/routines-engine')
    const routine = getRoutine(id)
    if (!routine) return { ok: false, error: 'Not found' }
    return await executeRoutine(routine)
  })
  ipcMain.handle('routines:get-runs', async (_e, routineId: string, limit?: number) => {
    const { getRoutineRuns } = await import('./routines/routines-engine')
    return getRoutineRuns(routineId, limit ?? 20)
  })

  // --- Context Assembly (Command Center) ---
  ipcMain.handle('context:assemble', async (_e, data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string }) => {
    try {
      const { assembleContext } = await import('./memory/context-assembler')
      return await assembleContext(data.attendeeNames, data.attendeeEmails, data.eventTitle)
    } catch (err: any) {
      console.error('[context:assemble]', err)
      return null
    }
  })

  // --- Prep Briefs ---
  ipcMain.handle('prep:generate', async (_e, data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string; model: string }) => {
    try {
      const { generatePrepBrief } = await import('./memory/prep-brief')
      return await generatePrepBrief(data.attendeeNames, data.attendeeEmails, data.eventTitle, data.model)
    } catch (err: any) {
      console.error('[prep:generate]', err)
      return null
    }
  })

  // --- Smart Notification (5min before meeting) ---
  ipcMain.handle('notify:meeting-prep', async (_e, data: { title: string; body: string }) => {
    try {
      const { Notification } = await import('electron')
      if (!Notification.isSupported()) return false
      const notif = new Notification({
        title: data.title,
        body: data.body,
        silent: false,
      })
      notif.on('click', () => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win) { win.show(); win.focus() }
      })
      notif.show()
      return true
    } catch (err: any) {
      console.error('[notify:meeting-prep]', err)
      return false
    }
  })

  // --- Agent API ---
  ipcMain.handle('api:enable', async () => {
    const { startApiServer, getApiToken, generateApiToken } = await import('./api/server')
    if (!getApiToken()) generateApiToken()
    setSetting('api-enabled', 'true')
    await startApiServer()
    return true
  })
  ipcMain.handle('api:disable', async () => {
    const { stopApiServer } = await import('./api/server')
    setSetting('api-enabled', 'false')
    await stopApiServer()
    return true
  })
  ipcMain.handle('api:get-status', async () => {
    const { getApiToken, getSocketPath, isApiRunning } = await import('./api/server')
    return {
      enabled: getSetting('api-enabled') === 'true',
      running: isApiRunning(),
      token: getApiToken(),
      socketPath: getSocketPath(),
    }
  })
  ipcMain.handle('api:regenerate-token', async () => {
    const { generateApiToken } = await import('./api/server')
    return generateApiToken()
  })

  // --- Coaching Feedback ---
  ipcMain.handle('coaching:generate-role-insights', async (_e, metrics: any, roleId: string, model?: string) => {
    const { generateRoleCoachingInsights } = await import('./models/coaching-feedback')
    return generateRoleCoachingInsights(metrics, roleId, model)
  })
  ipcMain.handle('coaching:analyze-conversation', async (_e, payload: any) => {
    const { analyzeConversationQuality } = await import('./models/conversation-coaching')
    return analyzeConversationQuality(payload)
  })
  ipcMain.handle('coaching:aggregate-insights', async (_e, meetings: any[], roleId: string, model?: string) => {
    const { aggregateCrossMeetingInsights } = await import('./models/conversation-coaching')
    return aggregateCrossMeetingInsights(meetings, roleId, model)
  })

  // --- Knowledge Base ---
  ipcMain.handle('kb:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'No active window' }
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Knowledge Base Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false }
    const folderPath = result.filePaths[0]
    setSetting('kb-folder-path', folderPath)
    const { scanFolder } = await import('./knowledge-base/kb-store')
    const stats = scanFolder(folderPath)
    return { ok: true, path: folderPath, ...stats }
  })
  ipcMain.handle('kb:scan', async () => {
    const folderPath = getSetting('kb-folder-path')
    if (!folderPath) return { ok: false, error: 'No KB folder configured' }
    const { scanFolder } = await import('./knowledge-base/kb-store')
    const stats = scanFolder(folderPath)
    return { ok: true, ...stats }
  })
  ipcMain.handle('kb:search', async (_e, query: string, topK?: number) => {
    const { searchKB } = await import('./knowledge-base/kb-store')
    return searchKB(query, topK ?? 5)
  })
  ipcMain.handle('kb:get-chunk-count', async () => {
    const { getChunkCount } = await import('./knowledge-base/kb-store')
    return getChunkCount()
  })
  ipcMain.handle('kb:clear', async () => {
    const { clearAllChunks } = await import('./knowledge-base/kb-store')
    clearAllChunks()
    setSetting('kb-folder-path', '')
    return { ok: true }
  })
  ipcMain.handle('kb:get-live-suggestions', async (_e, recentTranscript: string, model?: string) => {
    const { getLiveSuggestions } = await import('./knowledge-base/live-suggestions')
    return getLiveSuggestions(recentTranscript, model)
  })

  // --- Content protection (hide from screen share) ---
  ipcMain.handle('window:set-content-protection', async (_e, enabled: boolean) => {
    setSetting('hide-from-screen-share', enabled ? 'true' : 'false')
    setContentProtection(enabled)
    return true
  })

  // --- Window visibility (for recording privacy) ---
  ipcMain.handle('window:hide', async () => {
    const win = getMainWindow()
    if (win) win.hide()
  })

  ipcMain.handle('window:show', async () => {
    const win = getMainWindow()
    if (win) win.show()
  })

  // --- iCloud Sync ---
  ipcMain.handle('sync:get-status', () => {
    const { getSyncStatus } = require('./storage/icloud-sync')
    return getSyncStatus()
  })
  ipcMain.handle('sync:is-icloud-available', () => {
    const { isICloudAvailable } = require('./storage/icloud-sync')
    return isICloudAvailable()
  })
  ipcMain.handle('sync:enable', async () => {
    const { enableSync } = require('./storage/icloud-sync')
    return enableSync()
  })
  ipcMain.handle('sync:disable', () => {
    const { disableSync } = require('./storage/icloud-sync')
    disableSync()
    return true
  })
  ipcMain.handle('sync:force-sync', async () => {
    const { forceSyncNow } = require('./storage/icloud-sync')
    await forceSyncNow()
    return true
  })

  // --- App ---
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-arch', () => process.arch)
  ipcMain.handle('app:apple-foundation-available', () => checkAppleFoundationAvailable())
  ipcMain.handle('app:set-login-item', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return true
  })

  // --- Auto-updates ---
  ipcMain.handle('app:check-for-updates', async () => {
    try {
      // electron-updater is CJS — use default import, then destructure
      const pkg = await import('electron-updater')
      const autoUpdater = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
      if (!autoUpdater?.checkForUpdates) {
        return { ok: false as const, error: 'Auto-updater not available in this build' }
      }
      const result = await autoUpdater.checkForUpdates()
      const info = result?.updateInfo
      const isUpdateAvailable =
        typeof result?.isUpdateAvailable === 'boolean'
          ? result.isUpdateAvailable
          : !!(info?.version && info.version !== app.getVersion())
      return {
        ok: true as const,
        isUpdateAvailable,
        version: info?.version ?? null,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  })
  ipcMain.handle('app:install-update', async () => {
    const pkg = await import('electron-updater')
    const autoUpdater = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
    autoUpdater?.quitAndInstall(false, true)
  })
}
