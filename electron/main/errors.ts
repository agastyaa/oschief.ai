/**
 * Named error taxonomy for v2.11 reliability stream.
 *
 * Use discriminated-union matching on `error.name` for type flow. Each test
 * asserts the specific class, not generic Error.
 */

export function defineError(name: string) {
  return class extends Error {
    constructor(message: string, public meta?: Record<string, unknown>) {
      super(message)
      this.name = name
      Object.setPrototypeOf(this, new.target.prototype)
    }
  }
}

export const WALReplayError = defineError('WALReplayError')
export const WorkerSpawnError = defineError('WorkerSpawnError')
export const WorkerCrashed = defineError('WorkerCrashed')
export const WorkerRestartStorm = defineError('WorkerRestartStorm')
export const OfflineQueueFull = defineError('OfflineQueueFull')
export const OfflineQueueExhausted = defineError('OfflineQueueExhausted')
export const MaxRetriesExceeded = defineError('MaxRetriesExceeded')
export const AuthShortCircuit = defineError('AuthShortCircuit')
export const PermissionDenied = defineError('PermissionDenied')
export const PermissionRevoked = defineError('PermissionRevoked')
export const ICloudSyncedDBPath = defineError('ICloudSyncedDBPath')
