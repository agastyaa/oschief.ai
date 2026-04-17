import type { CalendarProviderId } from '@/components/ICSDialog'

/**
 * Shared preferences / account helpers for Settings sections.
 * Extracted from src/pages/SettingsPage.tsx as part of v2.10 decomposition.
 */

export const PREFS_LS_KEY = 'syag-preferences'
export const CALENDAR_PROVIDER_KEY = 'syag_calendar_provider'
export const AI_MODELS_SUB_QUERY = 'aiSub'

export type AiModelsSubTab = 'models' | 'transcription'

export interface Preferences {
  appearance: 'light' | 'dark' | 'system'
  toggleSound: boolean
  reduceMotion: boolean
}

export const defaultPrefs: Preferences = {
  appearance: 'system',
  toggleSound: false,
  reduceMotion: false,
}

export function getStoredCalendarProvider(): CalendarProviderId | null {
  try {
    const raw = localStorage.getItem(CALENDAR_PROVIDER_KEY)
    return raw ? (raw as CalendarProviderId) : null
  } catch {
    return null
  }
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY)
    if (!raw) return { ...defaultPrefs }
    return { ...defaultPrefs, ...JSON.parse(raw) }
  } catch {
    return { ...defaultPrefs }
  }
}

export function savePreferences(prefs: Preferences): void {
  localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs))
}

export function applyAppearance(mode: Preferences['appearance']): void {
  const root = document.documentElement
  if (mode === 'system') {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', systemDark)
  } else {
    root.classList.toggle('dark', mode === 'dark')
  }
}

export const ROLE_OPTIONS = [
  { id: 'ic', label: 'Individual Contributor' },
  { id: 'pm', label: 'Product Manager' },
  { id: 'em', label: 'Engineering Manager' },
  { id: 'designer', label: 'Designer' },
  { id: 'founder', label: 'Founder / CEO' },
  { id: 'exec', label: 'Executive' },
  { id: 'sales', label: 'Sales' },
  { id: 'cs', label: 'Customer Success' },
  { id: 'consultant', label: 'Consultant' },
  { id: 'other', label: 'Other' },
] as const

export function loadAccount(): { displayName: string; roleId: string } | null {
  try {
    const raw = localStorage.getItem('syag-account')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
