import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  CheckBox,
} from 'docx'
import { writeFileSync } from 'fs'

interface NoteData {
  title: string
  date: string
  duration: string
  timeRange?: string
  personalNotes: string
  transcript: { speaker: string; time: string; text: string }[]
  summary: {
    overview: string
    keyPoints?: string[]
    discussionTopics?: { topic: string; summary: string; speakers: string[] }[]
    decisions?: string[]
    actionItems?: { text: string; assignee: string; done: boolean; dueDate?: string; priority?: string }[]
    nextSteps?: { text: string; assignee: string; done: boolean; dueDate?: string }[]
    questionsAndOpenItems?: string[]
    followUps?: string[]
    keyQuotes?: { speaker: string; text: string }[]
  } | null
}

export async function exportToDocx(note: NoteData, filePath: string): Promise<void> {
  const children: Paragraph[] = []

  // Title
  children.push(new Paragraph({
    text: note.title || 'Untitled Meeting',
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
  }))

  // Metadata
  const metaParts: string[] = []
  if (note.date) metaParts.push(`Date: ${note.date}`)
  if (note.duration && note.duration !== '0:00') metaParts.push(`Duration: ${note.duration}`)
  if (note.timeRange) metaParts.push(`Time: ${note.timeRange}`)
  if (metaParts.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: metaParts.join('  |  '), color: '666666', size: 20 })],
      spacing: { after: 300 },
    }))
  }

  const summary = note.summary

  if (summary) {
    // Overview
    if (summary.overview) {
      children.push(sectionHeading('Summary'))
      children.push(new Paragraph({
        children: [new TextRun({ text: summary.overview })],
        spacing: { after: 200 },
      }))
    }

    // Key Points
    if (summary.keyPoints?.length) {
      children.push(sectionHeading('Key Points'))
      for (const kp of summary.keyPoints) {
        children.push(bulletParagraph(kp))
      }
    }

    // Discussion Topics
    if (summary.discussionTopics?.length) {
      children.push(sectionHeading('Discussion Topics'))
      for (const topic of summary.discussionTopics) {
        children.push(new Paragraph({
          children: [new TextRun({ text: topic.topic, bold: true })],
          spacing: { before: 100, after: 50 },
        }))
        if (topic.speakers?.length) {
          children.push(new Paragraph({
            children: [new TextRun({ text: `Speakers: ${topic.speakers.join(', ')}`, italics: true, color: '888888', size: 20 })],
          }))
        }
        // Parse bullets from summary
        const lines = topic.summary.split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
        for (const line of lines) {
          children.push(bulletParagraph(line))
        }
      }
    }

    // Decisions
    if (summary.decisions?.length) {
      children.push(sectionHeading('Decisions'))
      for (const d of summary.decisions) {
        children.push(bulletParagraph(d))
      }
    }

    // Action Items
    const actionItems = summary.actionItems || summary.nextSteps
    if (actionItems?.length) {
      children.push(sectionHeading('Action Items'))
      for (const ai of actionItems) {
        const assignee = ai.assignee && ai.assignee !== 'Unassigned' ? `${ai.assignee} — ` : ''
        const due = (ai as any).dueDate ? ` (by ${(ai as any).dueDate})` : ''
        const check = ai.done ? '☑' : '☐'
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${check} ${assignee}${ai.text}${due}` }),
          ],
          spacing: { after: 50 },
          indent: { left: 360 },
        }))
      }
    }

    // Open Questions
    if (summary.questionsAndOpenItems?.length) {
      children.push(sectionHeading('Open Questions'))
      for (const q of summary.questionsAndOpenItems) {
        children.push(bulletParagraph(q))
      }
    }

    // Follow-Ups
    if (summary.followUps?.length) {
      children.push(sectionHeading('Follow-Ups'))
      for (const f of summary.followUps) {
        children.push(bulletParagraph(f))
      }
    }

    // Key Quotes
    if (summary.keyQuotes?.length) {
      children.push(sectionHeading('Key Quotes'))
      for (const q of summary.keyQuotes) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `"${q.text}"`, italics: true }),
            new TextRun({ text: ` — ${q.speaker}`, color: '666666' }),
          ],
          spacing: { after: 100 },
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } },
        }))
      }
    }
  }

  // Personal Notes
  if (note.personalNotes?.trim()) {
    children.push(sectionHeading('Personal Notes'))
    for (const line of note.personalNotes.trim().split('\n')) {
      children.push(new Paragraph({ text: line, spacing: { after: 50 } }))
    }
  }

  // Transcript
  if (note.transcript?.length) {
    children.push(sectionHeading('Transcript'))
    for (const t of note.transcript) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `[${t.time}] ${t.speaker}: `, bold: true, size: 20 }),
          new TextRun({ text: t.text, size: 20 }),
        ],
        spacing: { after: 80 },
      }))
    }
  }

  const doc = new Document({
    sections: [{ children }],
    creator: 'Syag Note',
    title: note.title || 'Meeting Notes',
  })

  const buffer = await Packer.toBuffer(doc)
  writeFileSync(filePath, buffer)
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
  })
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}` })],
    spacing: { after: 50 },
    indent: { left: 360 },
  })
}
