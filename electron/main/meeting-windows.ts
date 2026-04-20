/**
 * Window-title based meeting detection.
 *
 * Complements process-based detection by catching meetings that run in a
 * browser tab — Google Meet being the killer case. The meeting "app" is
 * Chrome/Safari/Arc, and those processes don't change meaningfully when
 * you join a Meet. But the browser's on-screen window title DOES change
 * to something like "Meet – [meeting title] - Google Chrome" when a
 * Meet tab is focused.
 *
 * Uses Electron's desktopCapturer.getSources({types:['window']}) which
 * reads window metadata via CGWindowList under the hood. Requires Screen
 * Recording permission — OSChief already requires it for system-audio
 * capture, so no new ask.
 *
 * Patterns match the exact titles each meeting app / service puts on its
 * window when a call is active, carefully avoiding false positives from
 * "Microsoft Teams" (just chat) or "Google Meet" (the homepage).
 */

import { desktopCapturer, systemPreferences } from 'electron'

export interface MeetingWindow {
  app: string
  title: string
  matchedPattern: string
}

/**
 * Each entry: a regex that matches the window title, plus the display
 * name we surface in the notification. Patterns order matters — first
 * match wins — so put the most specific ones first.
 *
 * Design rule: the pattern must distinguish "in a call" from "just has
 * the app open." "Microsoft Teams" alone is ambiguous (could be chat);
 * "Meeting | Microsoft Teams" is the in-call window.
 */
// Titles that look like meetings but are actually lobby/landing pages.
// Checked first — a match here blocks the rest of the patterns from
// firing. Covers the "I have Meet open but haven't joined yet" case.
// Reject patterns must match the ENTIRE title (anchored) so they only
// block bare homepage/lobby windows, not titles that merely end in
// something like "Microsoft Teams" (which is where in-call meetings
// live — "Meeting | Microsoft Teams").
const REJECT_PATTERNS: RegExp[] = [
  /^Meet\s*[—–-]\s*New meeting.*$/i,
  /^Meet\s*[—–-]\s*Start an instant meeting.*$/i,
  /^Google Meet$/i,             // bare homepage
  /^Microsoft Teams$/i,         // bare app window (chat only)
  /^Teams\s*$/i,
]

const WINDOW_PATTERNS: Array<{ pattern: RegExp; app: string }> = [
  // Google Meet — browser tab title. Meet uses an en-dash or em-dash
  // depending on the browser / locale.
  { pattern: /\bMeet\s*[—–-]\s+\S+/i, app: 'Google Meet' },
  { pattern: /meet\.google\.com\/[a-z]/i, app: 'Google Meet' },

  // Zoom web client (Chrome/Safari/Edge)
  { pattern: /Zoom Meeting\b/i, app: 'Zoom' },
  { pattern: /Zoom - .*Meeting/i, app: 'Zoom' },

  // Microsoft Teams in-call window (distinct from chat)
  // Native app uses " | Microsoft Teams" suffix; web client uses a tab title.
  { pattern: /Meeting\s*\|\s*Microsoft Teams/i, app: 'Microsoft Teams' },
  { pattern: /\| Microsoft Teams$/i, app: 'Microsoft Teams' },
  { pattern: /teams\.microsoft\.com.*(meetup-join|meet)/i, app: 'Microsoft Teams' },

  // Webex
  { pattern: /Webex Meet(ing)?/i, app: 'Webex' },

  // GoTo, BlueJeans, Whereby (browser-first)
  { pattern: /GoTo Meeting/i, app: 'GoTo Meeting' },
  { pattern: /BlueJeans/i, app: 'BlueJeans' },
  { pattern: /whereby\.com\/[a-z]/i, app: 'Whereby' },
]

/**
 * Can we actually read window titles? Screen Recording permission is the
 * gate: without it, desktopCapturer still returns sources but the `name`
 * field is an empty string or "Screen Recording Required" on macOS.
 */
export function hasScreenRecordingPermission(): boolean {
  if (process.platform !== 'darwin') return true
  const status = systemPreferences.getMediaAccessStatus('screen')
  return status === 'granted'
}

/**
 * Scan every on-screen window, return the first meeting-app match.
 * Returns null when nothing matches or when Screen Recording permission
 * isn't granted.
 */
export async function detectMeetingWindow(): Promise<MeetingWindow | null> {
  if (!hasScreenRecordingPermission()) return null

  let sources: Electron.DesktopCapturerSource[]
  try {
    sources = await desktopCapturer.getSources({
      types: ['window'],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 }, // skip thumbnails — faster
    })
  } catch {
    return null
  }

  for (const source of sources) {
    const title = source.name || ''
    if (!title) continue
    // Reject-list first so "Meet – New meeting" lobby doesn't trigger.
    if (REJECT_PATTERNS.some((r) => r.test(title))) continue
    for (const { pattern, app } of WINDOW_PATTERNS) {
      if (pattern.test(title)) {
        return { app, title, matchedPattern: pattern.source }
      }
    }
  }
  return null
}
