import { BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { noteToHtml } from './note-html-template'

interface NoteData {
  title: string
  date: string
  duration: string
  timeRange?: string
  personalNotes: string
  transcript: { speaker: string; time: string; text: string }[]
  summary: any
}

/**
 * Export a note as PDF using Electron's built-in printToPDF.
 * Creates a hidden offscreen window, loads styled HTML, prints to PDF.
 */
export async function exportToPdf(note: NoteData, filePath: string): Promise<void> {
  const html = noteToHtml(note)

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  try {
    // Load the HTML content
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    // Wait a moment for rendering to complete
    await new Promise(resolve => setTimeout(resolve, 500))

    // Generate PDF
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: {
        marginType: 'custom',
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    })

    writeFileSync(filePath, pdfBuffer)
  } finally {
    win.destroy()
  }
}
