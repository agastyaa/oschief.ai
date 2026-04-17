import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

/**
 * Shared keychain state for IPC handlers. Multiple domain files (vault,
 * models/openrouter, integrations/digest) read the encrypted keychain file
 * on disk, so the cache + mutex live here in module scope.
 */

const keychainPath = (): string => {
  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'keychain.enc')
}

let keychainCache: Record<string, string> | null = null

let keychainLock: Promise<void> | null = null
const KEYCHAIN_LOCK_TIMEOUT_MS = 5000

export async function withKeychainLock<T>(fn: () => T): Promise<T> {
  if (keychainLock) {
    await Promise.race([
      keychainLock,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Keychain lock timeout (5s)')), KEYCHAIN_LOCK_TIMEOUT_MS),
      ),
    ])
  }
  let releaseLock!: () => void
  keychainLock = new Promise<void>((resolve) => { releaseLock = resolve })
  try {
    return fn()
  } finally {
    keychainLock = null
    releaseLock()
  }
}

export function loadKeychain(): Record<string, string> {
  if (keychainCache) return keychainCache
  const path = keychainPath()
  if (!existsSync(path)) { keychainCache = {}; return keychainCache }
  try {
    const encrypted = readFileSync(path)
    const decrypted = safeStorage.decryptString(encrypted)
    keychainCache = JSON.parse(decrypted)
    return keychainCache!
  } catch {
    keychainCache = {}
    return keychainCache
  }
}

export function saveKeychain(data: Record<string, string>): void {
  keychainCache = data
  const encrypted = safeStorage.encryptString(JSON.stringify(data))
  writeFileSync(keychainPath(), encrypted)
}
