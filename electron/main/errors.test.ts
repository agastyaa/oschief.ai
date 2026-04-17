import { describe, it, expect } from 'vitest'
import {
  defineError,
  WALReplayError,
  WorkerSpawnError,
  WorkerCrashed,
  WorkerRestartStorm,
  OfflineQueueFull,
  OfflineQueueExhausted,
  MaxRetriesExceeded,
  AuthShortCircuit,
  PermissionDenied,
  PermissionRevoked,
  ICloudSyncedDBPath,
} from './errors'

describe('errors taxonomy', () => {
  it('defineError produces classes with correct name and prototype chain', () => {
    const Foo = defineError('Foo')
    const e = new Foo('boom')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(Foo)
    expect(e.name).toBe('Foo')
    expect(e.message).toBe('boom')
  })

  it('meta field is attached', () => {
    const Foo = defineError('Foo')
    const e = new Foo('boom', { reason: 'x' })
    expect(e.meta).toEqual({ reason: 'x' })
  })

  it.each([
    ['WALReplayError', WALReplayError],
    ['WorkerSpawnError', WorkerSpawnError],
    ['WorkerCrashed', WorkerCrashed],
    ['WorkerRestartStorm', WorkerRestartStorm],
    ['OfflineQueueFull', OfflineQueueFull],
    ['OfflineQueueExhausted', OfflineQueueExhausted],
    ['MaxRetriesExceeded', MaxRetriesExceeded],
    ['AuthShortCircuit', AuthShortCircuit],
    ['PermissionDenied', PermissionDenied],
    ['PermissionRevoked', PermissionRevoked],
    ['ICloudSyncedDBPath', ICloudSyncedDBPath],
  ])('%s is instance of itself and Error with correct name', (name, Cls) => {
    const e = new Cls('msg')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(Cls)
    expect(e.name).toBe(name)
    expect((e as Error).message).toBe('msg')
  })

  it('discriminated-union matching via error.name works', () => {
    const errs: Error[] = [new WorkerCrashed('x'), new OfflineQueueFull('y')]
    const handled = errs.map((e) => {
      switch (e.name) {
        case 'WorkerCrashed':
          return 'worker'
        case 'OfflineQueueFull':
          return 'queue'
        default:
          return 'other'
      }
    })
    expect(handled).toEqual(['worker', 'queue'])
  })
})
