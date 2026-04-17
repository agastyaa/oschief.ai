/**
 * IPC handler registrar.
 *
 * Prior to v2.10 this was a single 2241-line function with 226 `ipcMain.handle`
 * calls (225 unique channels). Decomposed into 15 domain files under
 * `./ipc/*.ts` — see `docs/channel-to-domain.md` for the full channel→domain map.
 *
 * All 225 channels preserve identical behavior; this refactor is mechanical.
 */

import { registerAppHandlers } from './ipc/app'
import { registerCalendarHandlers } from './ipc/calendar'
import { registerCoachingHandlers } from './ipc/coaching'
import { registerDataHandlers } from './ipc/data'
import { registerExportHandlers } from './ipc/export'
import { registerIntegrationsHandlers } from './ipc/integrations'
import { registerIntelligenceHandlers } from './ipc/intelligence'
import { registerLLMHandlers } from './ipc/llm'
import { registerMemoryHandlers } from './ipc/memory'
import { registerModelsHandlers } from './ipc/models'
import { registerSTTHandlers } from './ipc/stt'
import { registerSyncHandlers } from './ipc/sync'
import { registerVaultHandlers } from './ipc/vault'
import { registerWindowHandlers } from './ipc/window'

export function registerIPCHandlers(): void {
  registerAppHandlers()
  registerCalendarHandlers()
  registerCoachingHandlers()
  registerDataHandlers()
  registerExportHandlers()
  registerIntegrationsHandlers()
  registerIntelligenceHandlers()
  registerLLMHandlers()
  registerMemoryHandlers()
  registerModelsHandlers()
  registerSTTHandlers()
  registerSyncHandlers()
  registerVaultHandlers()
  registerWindowHandlers()
}
