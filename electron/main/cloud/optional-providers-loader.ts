/**
 * Load optional (non-public) providers from userData/optional-providers/.
 *
 * If a file providerId.json exists, we require providerId.js and call its register(api).
 * The module registers with the router (id, handlers, meta). This loader then
 * registers IPC handlers for test/listModels. Optional provider files are NOT
 * in the repo; distribute them separately to select users.
 *
 * Unpackaged (dev): also loads from electron/main/cloud/optional-providers-dist/
 * (e.g. Copart) so local copies work without copying to Application Support.
 */

import { app, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { readdirSync, existsSync } from 'fs'
import {
  registerOptionalProvider,
  getApiKey,
  getOptionalProviderIds,
  getOptionalProviderHandlers,
} from './router'
import { netFetch } from './net-request'

export type OptionalProviderAPI = {
  getApiKey: (providerId: string) => string
  registerOptionalProvider: (providerId: string, handlers: import('./router').OptionalProviderHandlers) => void
  ipcMain: typeof ipcMain
  netFetch: typeof netFetch
  anthropic: typeof import('@anthropic-ai/sdk').default | null
}

function loadOptionalProvidersFromDir(dir: string, skipIfAlreadyRegistered: boolean): void {
  if (!existsSync(dir)) return

  let names: string[]
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.json'))
      .map((d) => d.name.replace(/\.json$/, ''))
  } catch {
    return
  }

  for (const id of names) {
    if (skipIfAlreadyRegistered && getOptionalProviderHandlers(id)) continue
    const jsPath = join(dir, `${id}.js`)
    if (!existsSync(jsPath)) continue
    try {
      const mod = require(jsPath)
      if (typeof mod.register !== 'function') continue
      let anthropic: OptionalProviderAPI['anthropic']
      try {
        anthropic = require('@anthropic-ai/sdk').default
      } catch {
        anthropic = null
      }
      const api: OptionalProviderAPI = {
        getApiKey,
        registerOptionalProvider,
        ipcMain,
        netFetch,
        anthropic,
      }
      mod.register(api)
    } catch (err) {
      console.warn(`[optional-providers] Failed to load ${id} from ${dir}:`, err)
    }
  }
}

export function loadOptionalProviders(): void {
  loadOptionalProvidersFromDir(join(app.getPath('userData'), 'optional-providers'), false)

  if (!app.isPackaged()) {
    const devCandidates = [
      resolve(process.cwd(), 'electron/main/cloud/optional-providers-dist'),
      resolve(app.getAppPath(), 'electron/main/cloud/optional-providers-dist'),
    ]
    const seen = new Set<string>()
    for (const devDist of devCandidates) {
      if (seen.has(devDist)) continue
      seen.add(devDist)
      loadOptionalProvidersFromDir(devDist, true)
    }
  }

  for (const id of getOptionalProviderIds()) {
    const h = getOptionalProviderHandlers(id)
    if (h?.test) {
      ipcMain.handle(`${id}:test`, () => h.test!())
    }
    if (h?.listModels) {
      ipcMain.handle(`${id}:listModels`, async () => {
        try {
          const apiKey = getApiKey(id)
          return await h.listModels!(apiKey)
        } catch {
          return { models: [], sttModels: [] }
        }
      })
    }
  }
}
