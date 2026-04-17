import { cn } from '@/lib/utils'
import type React from 'react'

/**
 * Shared low-level UI primitives for Settings sections.
 *
 * Extracted from src/pages/SettingsPage.tsx as part of the v2.10 SettingsPage
 * decomposition. These three primitives are used by every section-level
 * component (SyncSection, AgentApiSection, PrivacySection, VaultSection,
 * KnowledgeBaseSection, AccountSection, TemplatesSection, etc.) so they live
 * here to keep each section file small.
 */

export function Toggle({
  enabled,
  onToggle,
  disabled,
}: {
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors flex-shrink-0',
        disabled ? 'bg-muted opacity-50 cursor-not-allowed' : enabled ? 'bg-accent' : 'bg-secondary',
      )}
    >
      <div
        className="absolute top-0.5 h-4 w-4 rounded-full bg-accent-foreground shadow-sm transition-transform"
        style={{ left: 2, transform: enabled ? 'translateX(16px)' : 'translateX(0px)' }}
      />
    </button>
  )
}

export function SettingRow({
  label,
  description,
  children,
  disabled,
}: {
  label: string
  description?: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border border-border bg-card p-3 gap-4',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      <div className="min-w-0">
        <span className="text-body-sm text-foreground">{label}</span>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      {description && <p className="text-[12px] text-muted-foreground mt-1">{description}</p>}
    </div>
  )
}
