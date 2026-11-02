import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const output = path.join(root, 'packages/vision-core/evidence')
const origin = process.argv[2] ?? 'http://127.0.0.1:5174'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
await page.route(origin + '/camera-test', route => route.fulfill({ contentType: 'text/html', body: '<html><body><main id="root"></main></body></html>' }))
await page.goto(origin + '/camera-test')
const result = await page.evaluate(async () => {
  const { mountCameraHarness } = await import('/packages/vision-core/src/camera.browser.ts')
  const harness = mountCameraHarness(document.querySelector('#root'))
  const tick = () => new Promise(resolve => setTimeout(resolve, 30))
  await tick()
  const results = []
  const assert = (name, passed, details) => { results.push({ name, passed, details }); if (!passed) throw new Error(name + ': ' + JSON.stringify(details)) }
  const devices = navigator.mediaDevices
  const original = devices.getUserMedia
  let mode = 'denied'
  let stops = 0
  let facing = null
  let resolvePending = null
  const createStream = () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
    const stream = canvas.captureStream(30)
    for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { stops++; stop() } }
    return stream
  }
  devices.getUserMedia = async constraints => {
    facing = constraints.video.facingMode.ideal
    if (mode === 'denied') throw new DOMException('Denied', 'NotAllowedError')
    if (mode === 'pending') return new Promise(resolve => { resolvePending = resolve })
    return createStream()
  }
  await harness.getState().open(); await tick()
  assert('camera permission denial recoverable', !!harness.getState().error?.includes('permission') && !harness.getState().stream, {error:harness.getState().error})
  mode = 'success'
  await harness.getState().open(); await tick()
  assert('camera opens only on explicit action', !!harness.getState().stream && !harness.getState().error, {facing})
  const stream = harness.getState().stream
  let visible = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible ? 'visible' : 'hidden' })
  document.dispatchEvent(new Event('visibilitychange')); await tick()
  assert('backgrounding stops camera and clears active stream', stream.getVideoTracks().every(track => track.readyState === 'ended') && !harness.getState().stream, {stops})
  visible = true; document.dispatchEvent(new Event('visibilitychange')); await tick()
  assert('foreground never restarts camera automatically', !harness.getState().stream, {stops})
  await harness.getState().open(); await tick()
  await harness.getState().switchCamera(); await tick()
  assert('switching stops previous stream', stops === 2 && facing === 'environment', {stops,facing})
  harness.getState().close(); await tick()
  assert('closing stops active stream', stops === 3 && !harness.getState().stream, {stops})
  mode = 'pending'
  const pending = harness.getState().open()
  harness.getState().close()
  resolvePending(createStream()); await pending; await tick()
  assert('cancelled pending request stops late stream', stops === 4 && !harness.getState().stream, {stops})
  const hiddenPending = harness.getState().open()
  visible = false; document.dispatchEvent(new Event('visibilitychange'))
  resolvePending(createStream()); await hiddenPending; await tick()
  assert('backgrounding invalidates late permission result', stops === 5 && !harness.getState().stream, {stops})
  visible = true; document.dispatchEvent(new Event('visibilitychange'))
  mode = 'success'
  await harness.getState().open(); await tick()
  harness.unmount(); await tick()
  assert('unmount releases camera', stops === 6, {stops})
  devices.getUserMedia = original
  return { checks: results, fakeMedia: true, note: 'Real MediaStream via canvas.captureStream; permission result and document visibility are controlled fixtures. No claim of physical camera/device behavior.' }
})
await writeFile(path.join(output, 'camera-lifecycle.json'), JSON.stringify({ recordedAt: new Date().toISOString(), browser: browser.version(), ...result }, null, 2))
console.log(JSON.stringify(result, null, 2))
await browser.close()
