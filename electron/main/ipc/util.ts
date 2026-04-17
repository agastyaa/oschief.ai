import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { createLogger } from '../util/logger'

const log = createLogger('ipc')

/**
 * Standard IPC error envelope. Renderer unwraps `{ error }` into a rejected
 * promise; `ok` responses pass through as the resolved value.
 */
export type IPCResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): IPCResult<T> { return { ok: true, data } }
export function err(error: unknown): IPCResult<never> {
  const msg = error instanceof Error ? error.message : String(error)
  return { ok: false, error: msg }
}

/**
 * Register an IPC handler with standardized logging and error handling.
 * Replaces the 63 scattered try/catch blocks across ipc-handlers.ts.
 *
 * Usage:
 *   withIPC('channel:name', async (_e, arg1, arg2) => { ... return result })
 *
 * Errors from the handler are:
 *   1. Logged with the channel name and error message
 *   2. Re-thrown so the renderer's ipcRenderer.invoke rejects
 *
 * v2.10 does NOT include Zod validation — args pass through as-is. Zod lands
 * in v2.11 on top of this stable structure.
 */
export function withIPC<A extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await handler(event, ...(args as A))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error(`handler failed`, { channel, error: msg })
      throw e
    }
  })
}
