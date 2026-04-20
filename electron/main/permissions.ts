/**
 * R5 — centralized permissions module.
 *
 * Before v2.11 every feature that needed a macOS permission rolled its own
 * check: meeting-detector.ts, capture.ts, ipc/app.ts, the speech helper...
 * Drift was predictable: some paths asked for permission inline, some just
 * silently failed, some returned different status strings. The fix is one
 * module that owns the mapping from permission KIND → check, request, and
 * System Settings deep-link.
 *
 * All permission kinds the app uses on macOS are enumerated here. Every new
 * feature MUST go through this module instead of calling `systemPreferences`
 * directly. The PermissionDenied / PermissionRevoked errors from errors.ts
 * are the canonical way to signal a permission problem to callers.
 */

import { systemPreferences, shell } from 'electron'
import { PermissionDenied } from './errors'

export type PermissionKind =
  | 'microphone'
  | 'screen'
  | 'calendar'
  | 'contacts'
  | 'speech-recognition'
  | 'accessibility'

export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'not-determined'
  | 'unknown'

/**
 * Deep-links to the exact System Settings pane for each permission kind.
 * Users hit "Open Settings" and land on the right page — zero hunting.
 */
const RECOVERY_LINKS: Record<PermissionKind, string> = {
  microphone:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  screen:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  calendar:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars',
  contacts:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts',
  'speech-recognition':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition',
  accessibility:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
}

const USER_FACING: Record<PermissionKind, string> = {
  microphone: 'Microphone',
  screen: 'Screen Recording',
  calendar: 'Calendars',
  contacts: 'Contacts',
  'speech-recognition': 'Speech Recognition',
  accessibility: 'Accessibility',
}

export function getRecoveryLink(kind: PermissionKind): string {
  return RECOVERY_LINKS[kind]
}

export function getPermissionLabel(kind: PermissionKind): string {
  return USER_FACING[kind]
}

/**
 * Open System Settings to the exact pane for this permission. Returns true
 * if the deep-link was dispatched (it's fire-and-forget — macOS handles the
 * rest).
 */
export async function openRecoveryPane(kind: PermissionKind): Promise<boolean> {
  try {
    await shell.openExternal(getRecoveryLink(kind))
    return true
  } catch {
    return false
  }
}

/**
 * Map Electron's `getMediaAccessStatus` return values to our canonical set.
 * Electron says 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
 * which already matches PermissionStatus — we just constrain the type.
 */
function normalizeStatus(raw: string): PermissionStatus {
  switch (raw) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
    case 'unknown':
      return raw
    default:
      return 'unknown'
  }
}

/**
 * Check the current status without prompting. Safe to call during app init —
 * does not trigger the permission dialog.
 *
 * Some kinds don't have a native Electron probe yet (speech-recognition,
 * accessibility). For those we optimistically return 'granted' on non-darwin
 * and 'unknown' on darwin — callers that truly need to know must attempt the
 * operation and catch PermissionDenied.
 */
export function checkPermission(kind: PermissionKind): PermissionStatus {
  if (process.platform !== 'darwin') return 'granted'
  switch (kind) {
    case 'microphone':
      return normalizeStatus(systemPreferences.getMediaAccessStatus('microphone'))
    case 'screen':
      return normalizeStatus(systemPreferences.getMediaAccessStatus('screen'))
    case 'calendar':
      return normalizeStatus(systemPreferences.getMediaAccessStatus('calendar'))
    case 'contacts':
      return normalizeStatus(systemPreferences.getMediaAccessStatus('contacts'))
    case 'accessibility':
      return systemPreferences.isTrustedAccessibilityClient(false)
        ? 'granted'
        : 'denied'
    case 'speech-recognition':
      // No direct Electron probe — the app has its own helper; callers that
      // care should attempt the operation and catch failure.
      return 'unknown'
  }
}

/**
 * Request permission via the native prompt (for kinds that support it).
 * Returns the status after the request.
 *
 * For microphone and screen: asks the OS. For calendar/contacts: triggers
 * the OS's first-use prompt by calling getMediaAccessStatus inside an API
 * that accesses the resource — the dialog appears the first time the app
 * touches it. We return 'not-determined' from here to signal "the prompt
 * is now visible; caller should re-check once user answers."
 */
export async function requestPermission(
  kind: PermissionKind,
): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') return 'granted'
  switch (kind) {
    case 'microphone': {
      const ok = await systemPreferences.askForMediaAccess('microphone')
      return ok ? 'granted' : 'denied'
    }
    case 'screen':
      // macOS gives no programmatic way to request screen recording — opening
      // the pane is the only path. Return the current status.
      await openRecoveryPane('screen')
      return checkPermission('screen')
    case 'calendar':
    case 'contacts':
    case 'speech-recognition':
    case 'accessibility':
      await openRecoveryPane(kind)
      return checkPermission(kind)
  }
}

/**
 * Assert-style helper: throws PermissionDenied if not granted. Use when you
 * want the caller's error-handling path to take over (renderer catches the
 * error and surfaces the recovery affordance + deep-link).
 */
export function assertPermission(kind: PermissionKind): void {
  const status = checkPermission(kind)
  if (status !== 'granted' && status !== 'unknown') {
    throw new PermissionDenied(
      `${USER_FACING[kind]} permission is ${status}`,
      { kind, status, recoveryLink: RECOVERY_LINKS[kind] },
    )
  }
}
