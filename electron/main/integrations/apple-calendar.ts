/**
 * Apple Calendar integration — reads events from macOS Calendar via EventKit.
 *
 * Uses a lightweight Swift helper that accesses the EventKit framework directly.
 * This reads ALL calendar accounts synced to the Mac (iCloud, Google, Exchange, etc.)
 * Requires Calendar permission on first use (macOS will prompt).
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync, writeFileSync, mkdirSync, chmodSync } from 'fs'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

export interface AppleCalendarAttendee {
  email: string
  name: string
}

export interface AppleCalendarEvent {
  id: string
  title: string
  start: string       // ISO timestamp
  end: string         // ISO timestamp
  location?: string
  notes?: string
  isAllDay: boolean
  attendees?: AppleCalendarAttendee[]
  calendarName?: string
}

/**
 * Get the path to the Swift EventKit helper binary.
 * Compiles it on first use if needed.
 */
async function getHelperPath(): Promise<string> {
  const helperDir = join(app.getPath('userData'), 'helpers')
  const binaryPath = join(helperDir, 'eventkit-helper')
  const sourcePath = join(helperDir, 'eventkit-helper.swift')

  if (existsSync(binaryPath)) return binaryPath

  mkdirSync(helperDir, { recursive: true })

  // Write the Swift source
  const swiftSource = `
import Foundation
import EventKit

let store = EKEventStore()

func requestAccess() -> Bool {
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { g, _ in
            granted = g
            semaphore.signal()
        }
    } else {
        store.requestAccess(to: .event) { g, _ in
            granted = g
            semaphore.signal()
        }
    }
    semaphore.wait()
    return granted
}

func fetchEvents(daysPast: Int, daysAhead: Int) {
    let cal = Calendar.current
    let now = Date()
    guard let start = cal.date(byAdding: .day, value: -daysPast, to: now),
          let end = cal.date(byAdding: .day, value: daysAhead, to: now) else {
        print("[]")
        return
    }

    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let events = store.events(matching: predicate)

    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]

    var results: [[String: Any]] = []
    for event in events {
        var dict: [String: Any] = [
            "id": event.eventIdentifier ?? UUID().uuidString,
            "title": event.title ?? "Untitled",
            "start": formatter.string(from: event.startDate),
            "end": formatter.string(from: event.endDate),
            "isAllDay": event.isAllDay,
        ]
        if let loc = event.location, !loc.isEmpty { dict["location"] = loc }
        if let notes = event.notes, !notes.isEmpty { dict["notes"] = notes }
        if let calName = event.calendar?.title { dict["calendarName"] = calName }

        var attendees: [[String: String]] = []
        if let participants = event.attendees {
            for att in participants {
                var a: [String: String] = [:]
                if let url = att.url, url.scheme == "mailto" {
                    a["email"] = url.absoluteString.replacingOccurrences(of: "mailto:", with: "")
                }
                a["name"] = att.name ?? a["email"] ?? "Unknown"
                if !a.isEmpty { attendees.append(a) }
            }
        }
        if !attendees.isEmpty { dict["attendees"] = attendees }

        results.append(dict)
    }

    if let data = try? JSONSerialization.data(withJSONObject: results),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("[]")
    }
}

// Main
let args = CommandLine.arguments
if args.contains("--check") {
    let ok = requestAccess()
    print(ok ? "ok" : "denied")
    exit(0)
}

let daysPast = Int(args.first(where: { $0.hasPrefix("--past=") })?.replacingOccurrences(of: "--past=", with: "") ?? "7") ?? 7
let daysAhead = Int(args.first(where: { $0.hasPrefix("--ahead=") })?.replacingOccurrences(of: "--ahead=", with: "") ?? "14") ?? 14

if !requestAccess() {
    fputs("denied\\n", stderr)
    exit(1)
}

fetchEvents(daysPast: daysPast, daysAhead: daysAhead)
`
  writeFileSync(sourcePath, swiftSource)

  // Compile
  try {
    await execFileAsync('swiftc', [
      '-O', sourcePath,
      '-o', binaryPath,
      '-framework', 'EventKit',
      '-framework', 'Foundation',
    ], { timeout: 60000 })
    chmodSync(binaryPath, 0o755)
    console.log('[apple-calendar] Compiled EventKit helper')
  } catch (err: any) {
    console.error('[apple-calendar] Failed to compile helper:', err.message)
    throw new Error('Failed to compile EventKit helper. Ensure Xcode Command Line Tools are installed.')
  }

  return binaryPath
}

/**
 * Fetch events from macOS Calendar via EventKit.
 */
export async function fetchAppleCalendarEvents(
  options: { daysPast?: number; daysAhead?: number } = {}
): Promise<{ ok: boolean; events: AppleCalendarEvent[]; error?: string }> {
  const daysPast = options.daysPast ?? 7
  const daysAhead = options.daysAhead ?? 14

  try {
    const helperPath = await getHelperPath()
    const { stdout, stderr } = await execFileAsync(helperPath, [
      `--past=${daysPast}`,
      `--ahead=${daysAhead}`,
    ], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 })

    if (stderr?.includes('denied')) {
      return {
        ok: false,
        events: [],
        error: 'Calendar access denied. Go to System Settings → Privacy & Security → Calendars and allow OSChief.',
      }
    }

    const raw = JSON.parse(stdout.trim() || '[]')
    const events: AppleCalendarEvent[] = raw.map((e: any) => ({
      id: e.id || `apple-${Date.now()}-${Math.random()}`,
      title: e.title || 'Untitled',
      start: e.start || '',
      end: e.end || '',
      isAllDay: e.isAllDay || false,
      location: e.location || undefined,
      notes: e.notes || undefined,
      calendarName: e.calendarName || undefined,
      attendees: e.attendees?.map((a: any) => ({
        email: a.email || '',
        name: a.name || a.email?.split('@')[0] || 'Unknown',
      })),
    }))

    events.sort((a, b) => a.start.localeCompare(b.start))
    return { ok: true, events }
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes('denied') || msg.includes('-1743')) {
      return {
        ok: false,
        events: [],
        error: 'Calendar access denied. Go to System Settings → Privacy & Security → Calendars and allow OSChief.',
      }
    }
    console.error('[apple-calendar] Failed:', msg)
    return { ok: false, events: [], error: `Calendar read failed: ${msg.slice(0, 120)}` }
  }
}

/**
 * Quick check if EventKit access is granted.
 */
export async function checkAppleCalendarAccess(): Promise<boolean> {
  try {
    const helperPath = await getHelperPath()
    const { stdout } = await execFileAsync(helperPath, ['--check'], { timeout: 10000 })
    return stdout.trim() === 'ok'
  } catch {
    return false
  }
}
