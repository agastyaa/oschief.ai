/**
 * Load optional (non-public) providers from userData/optional-providers/.
 *
 * If a file providerId.json exists, we require providerId.js and call its register(api).
 * The module registers with the router (id, handlers, meta). This loader then
 * registers IPC handlers for test/listModels. Optional provider files are NOT
 * in the repo; distribute them separately to select users.
 *
 * Unpackaged (dev): also loads from electron/main/cloud/optional-providers-dist/
 * so local copies work without copying to Application Support.
 */

import { app, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import Anthropic from '@anthropic-ai/sdk'
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
      const nodeRequire = createRequire(join(dir, '_'))
      const mod = nodeRequire(jsPath)
      if (typeof mod.register !== 'function') continue
      const anthropic: OptionalProviderAPI['anthropic'] = Anthropic ?? null
      const api: OptionalProviderAPI = {
        getApiKey,
        registerOptionalProvider,
        ipcMain,
        netFetch,
        anthropic,
      }
      mod.register(api)

      // Enrich meta with models/sttModels from the JSON manifest
      const handlers = getOptionalProviderHandlers(id)
      if (handlers?.meta) {
        try {
          const jsonData = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf-8'))
          if (Array.isArray(jsonData.models)) handlers.meta.models = jsonData.models
          if (Array.isArray(jsonData.sttModels)) handlers.meta.sttModels = jsonData.sttModels
        } catch {}
      }
    } catch (err) {
      console.warn(`[optional-providers] Failed to load ${id} from ${dir}:`, err)
    }
  }
}

export function loadOptionalProviders(): void {
  loadOptionalProvidersFromDir(join(app.getPath('userData'), 'optional-providers'), false)

  if (app.isPackaged) {
    const resourceDir = join(process.resourcesPath, 'optional-providers')
    loadOptionalProvidersFromDir(resourceDir, true)
  } else {
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
