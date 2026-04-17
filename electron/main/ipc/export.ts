import { ipcMain, BrowserWindow, app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

/**
 * Export handlers: docx, pdf, obsidian vault.
 * export (3) = 3 channels.
 */
export function registerExportHandlers(): void {
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
      const { exportToDocx } = await import('../export/docx-exporter')
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
      const { exportToPdf } = await import('../export/pdf-exporter')
      await exportToPdf(noteData, result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err: any) {
      console.error('[export:pdf]', err)
      return { ok: false, error: err.message || 'Export failed' }
    }
  })

  ipcMain.handle('export:obsidian', async (_e, noteData: any) => {
    try {
      const { getVaultPath, setVaultPath, validateVaultPath, buildVaultNotePath, buildObsidianUri } = await import('../vault/vault-config')
      const { updatePeopleMdForNote } = await import('../vault/people-md')
      const { updateProjectMd } = await import('../vault/projects-md')
      const { getNotePeople } = await import('../memory/people-store')
      const { getProjectsForNote } = await import('../memory/project-store')
      const { createHash } = await import('crypto')
      const { homedir } = await import('os')

      let vaultPath = getVaultPath()

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

      const resolvedVault = vaultPath.startsWith('~') ? vaultPath.replace('~', homedir()) : vaultPath

      const noteDate = noteData.date || new Date().toISOString().slice(0, 10)
      const noteTitle = noteData.title || 'Untitled Meeting'
      const noteId = noteData.id || 'unknown'
      const relativePath = buildVaultNotePath(noteDate, noteTitle, noteId)
      const absolutePath = join(resolvedVault, relativePath)

      mkdirSync(dirname(absolutePath), { recursive: true })

      const people = noteData.id ? getNotePeople(noteData.id) : []
      const peopleWikilinks = people.map((p: any) => `  - "[[${p.name}]]"`)
      const noteProjects = noteData.id ? getProjectsForNote(noteData.id) : []

      const frontmatter: string[] = []
      frontmatter.push('---')
      frontmatter.push(`id: oschief-${(noteId).slice(0, 12)}`)
      frontmatter.push(`date: ${noteDate}`)
      if (noteData.time) frontmatter.push(`time: "${noteData.time}"`)
      frontmatter.push(`title: "${noteTitle.replace(/"/g, '\\"')}"`)
      if (noteData.duration) frontmatter.push(`duration: "${noteData.duration}"`)
      if (peopleWikilinks.length > 0) {
        frontmatter.push('people:')
        frontmatter.push(...peopleWikilinks)
      }
      if (noteProjects.length > 0) frontmatter.push(`project: "[[${noteProjects[0].name}]]"`)
      frontmatter.push('tags: [meeting, oschief]')
      frontmatter.push('---')

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

      let finalPath = absolutePath
      if (existsSync(absolutePath)) {
        const existingContent = readFileSync(absolutePath, 'utf-8')
        const existingHash = createHash('sha256').update(existingContent).digest('hex')
        const newHash = createHash('sha256').update(fullContent).digest('hex')
        if (existingHash === newHash) {
          const obsidianUri = buildObsidianUri(relativePath)
          return { ok: true, path: absolutePath, obsidianUri, skipped: true }
        }
        finalPath = absolutePath.replace(/\.md$/, '-v2.md')
        let suffix = 2
        while (existsSync(finalPath)) {
          suffix++
          finalPath = absolutePath.replace(/\.md$/, `-v${suffix}.md`)
        }
      }

      writeFileSync(finalPath, fullContent, 'utf-8')

      const meeting = { date: noteDate, title: noteTitle }
      if (people.length > 0) {
        updatePeopleMdForNote(
          people.map((p: any) => ({ name: p.name, email: p.email, company: p.company, role: p.role })),
          meeting,
        )
      }

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

      const finalRelativePath = finalPath.slice(resolvedVault.length + 1)
      const obsidianUri = buildObsidianUri(finalRelativePath)

      console.log(`[export:obsidian] Wrote vault note: ${finalPath}`)
      return { ok: true, path: finalPath, obsidianUri, conflict: finalPath !== absolutePath }
    } catch (err: any) {
      console.error('[export:obsidian]', err)
      return { ok: false, error: err.message || 'Export failed' }
    }
  })
}
