import type { CalendarProviderId } from '@/components/ICSDialog'
import { ACCOUNT_LS_KEY } from '@/lib/account-context'

/**
 * Shared preferences / account helpers for Settings sections.
 * Extracted from src/pages/SettingsPage.tsx as part of v2.10 decomposition.
 */

export const PREFS_LS_KEY = 'syag-preferences'
export const CALENDAR_PROVIDER_KEY = 'syag_calendar_provider'
export const AI_MODELS_SUB_QUERY = 'aiSub'

export type AiModelsSubTab = 'models' | 'transcription'

export interface Preferences {
  showRecordingIndicator: boolean
  launchOnStartup: boolean
  hideFromScreenShare: boolean
  appearance: 'light' | 'dark' | 'system'
}

export const defaultPrefs: Preferences = {
  showRecordingIndicator: true,
  launchOnStartup: false,
  hideFromScreenShare: false,
  appearance: 'system',
}

export function getStoredCalendarProvider(): CalendarProviderId | null {
  try {
    const v = localStorage.getItem(CALENDAR_PROVIDER_KEY)
    if (v === 'google' || v === 'apple') return v
  } catch {}
  return null
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY)
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) }
  } catch {}
  return defaultPrefs
}

export function savePreferences(prefs: Preferences): void {
  localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs))
}

export function applyAppearance(mode: Preferences['appearance']): void {
  const root = document.documentElement
  if (mode === 'dark') {
    root.classList.add('dark')
  } else if (mode === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

/** Predefined roles for the coaching knowledge base — must match electron/main/models/coaching-kb.ts */
export const ROLE_OPTIONS = [
  { id: 'product-manager', label: 'Product Manager', icon: '📦' },
  { id: 'engineering-manager', label: 'Engineering Manager', icon: '⚙️' },
  { id: 'engineer', label: 'Software Engineer', icon: '💻' },
  { id: 'founder-ceo', label: 'Founder / CEO', icon: '🚀' },
  { id: 'designer', label: 'Designer', icon: '🎨' },
  { id: 'sales', label: 'Sales', icon: '💼' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'operations', label: 'Operations', icon: '🔧' },
  { id: 'data-science', label: 'Data / Analytics', icon: '📊' },
  { id: 'people-hr', label: 'People / HR', icon: '🤝' },
  { id: 'custom', label: 'Other', icon: '✏️' },
] as const

export function loadAccount(): any {
  try {
    const raw = localStorage.getItem(ACCOUNT_LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { name: '', email: '', role: '', roleId: '', company: '' }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
