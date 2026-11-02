import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ workers: 0, mains: 0, mainFailures: 0, loads: 0, workerReject: null as ((error: Error) => void) | null, deferWorker: false, constructorFailure: false }))
vi.mock('./workerClient', () => ({ VisionWorkerClient: class {
  static supported() { return true }
  isBusy = false
  constructor() { state.workers++; if(state.constructorFailure)throw new Error('Worker blocked by policy') }
  load() { return state.deferWorker ? new Promise<void>((_resolve, reject) => { state.workerReject = reject }) : Promise.reject(new Error('Worker transport unavailable')) }
  dispose() {}
} }))
vi.mock('./pipeline', () => ({ VisionPipeline: class {
  isBusy = false
  constructor() { state.mains++ }
  async load() { state.loads++; if (state.mainFailures-- > 0) throw new Error('Temporary model fetch failure') }
  dispose() {}
} }))
import { createVision } from './createVision'
beforeEach(() => { state.workers = 0; state.mains = 0; state.loads = 0; state.mainFailures = 0; state.deferWorker = false; state.workerReject = null; state.constructorFailure = false })
describe('vision worker failover control (not model inference)', () => {
  it('uses the main engine when module worker construction is blocked', async()=>{
    state.constructorFailure=true
    const vision=createVision()
    await expect(vision.load()).resolves.toBeUndefined()
    expect(state.mains).toBe(1)
    vision.dispose()
  })
  it('retries a transient model failure without remounting or replacing the main engine', async () => {
    state.mainFailures = 1
    const vision = createVision()
    await expect(vision.load()).rejects.toThrow('Temporary model fetch failure')
    await expect(vision.load()).resolves.toBeUndefined()
    expect(state.mains).toBe(1)
    expect(state.workers).toBe(1)
    vision.dispose()
  })
  it('creates a single main engine when concurrent worker requests fail', async () => {
    const vision = createVision()
    await expect(Promise.all([vision.load({ face: true }), vision.load({ hair: true })])).resolves.toEqual([undefined, undefined])
    expect(state.mains).toBe(1)
    vision.dispose()
  })
  it('never starts fallback inference after disposal', async () => {
    state.deferWorker = true
    const vision = createVision()
    const pending = vision.load()
    vision.dispose()
    state.workerReject?.(new Error('Disposed worker request'))
    await expect(pending).rejects.toThrow('disposed')
    expect(state.mains).toBe(0)
  })
})
