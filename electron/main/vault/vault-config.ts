/**
 * Vault configuration helpers.
 *
 * Reads/writes the vault path from the settings KV table,
 * validates paths, and builds obsidian:// URIs.
 */

import { existsSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import { homedir } from 'os'
import { getSetting, setSetting } from '../storage/database'

const VAULT_PATH_KEY = 'obsidian-vault-path'

// ── Read / Write ────────────────────────────────────────────────────

export function getVaultPath(): string | null {
  return getSetting(VAULT_PATH_KEY) ?? null
}

export function setVaultPath(path: string): void {
  setSetting(VAULT_PATH_KEY, path)
}

export function isVaultConfigured(): boolean {
  const p = getVaultPath()
  return p !== null && p.length > 0
}

// ── Validation ──────────────────────────────────────────────────────

export interface VaultValidation {
  valid: boolean
  error?: string
  warning?: string
}

export function validateVaultPath(path: string): VaultValidation {
  if (!path || path.trim().length === 0) {
    return { valid: false, error: 'Path is empty' }
  }

  // Must be under home directory
  const home = homedir()
  if (!path.startsWith(home) && !path.startsWith('~')) {
    return { valid: false, error: 'Vault path must be under your home directory' }
  }

  // Resolve ~ to home
  const resolved = path.startsWith('~') ? path.replace('~', home) : path

  if (!existsSync(resolved)) {
    return { valid: false, error: 'Directory does not exist' }
  }

  try {
    if (!statSync(resolved).isDirectory()) {
      return { valid: false, error: 'Path is not a directory' }
    }
  } catch {
    return { valid: false, error: 'Cannot access path' }
  }

  // Warn if no .obsidian folder (might not be an Obsidian vault)
  const obsidianDir = join(resolved, '.obsidian')
  if (!existsSync(obsidianDir)) {
    return { valid: true, warning: 'No .obsidian folder found — this may not be an Obsidian vault' }
  }

  return { valid: true }
}

// ── Vault Name ──────────────────────────────────────────────────────

/**
 * Extract the vault name from the vault path.
 * Obsidian vault name = the folder name that contains .obsidian/
 * If .obsidian/ isn't found, use the last path component.
 */
export function getVaultName(): string | null {
  const vaultPath = getVaultPath()
  if (!vaultPath) return null

  const resolved = vaultPath.startsWith('~') ? vaultPath.replace('~', homedir()) : vaultPath

  // Walk up to find the folder containing .obsidian/
  let current = resolved
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, '.obsidian'))) {
      return basename(current)
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  // Fallback: last component of the configured path
  return basename(resolved)
}

// ── Obsidian URI ────────────────────────────────────────────────────

/**
 * Build an obsidian:// URI for a file in the vault.
 * @param relativePath Path relative to the vault root (e.g. "meetings/2026-03-23 Call.md")
 */
export function buildObsidianUri(relativePath: string): string | null {
  const vaultName = getVaultName()
  if (!vaultName) return null

  // Strip .md extension — Obsidian URIs don't use extensions
  const fileRef = relativePath.replace(/\.md$/, '')

  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(fileRef)}`
}

// ── Filename Sanitization ───────────────────────────────────────────

/**
 * Sanitize a string for use as a filename.
 * Replaces characters that are invalid on macOS/Windows filesystems.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim()
}

/**
 * Build the vault file path for a meeting note.
 * Format: meetings/2026-03-23 Title (noteId).md
 */
export function buildVaultNotePath(date: string, title: string, noteId: string): string {
  const safeTitle = sanitizeFilename(title || 'Untitled Meeting')
  const shortId = noteId.slice(0, 8)
  return join('meetings', `${date} ${safeTitle} (${shortId}).md`)
}
