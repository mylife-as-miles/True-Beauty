import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const output = path.join(root, 'packages/vision-core/evidence')
await mkdir(output, { recursive: true })
const origin = process.argv[2] ?? 'http://127.0.0.1:5174'
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } })
await page.route(origin + '/vision-test', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><head><title>Local Vision Verification</title></head><body></body></html>' }))
await page.goto(origin + '/vision-test')
const result = await page.evaluate(async () => {
  const { VisionPipeline } = await import('/packages/vision-core/src/index.ts')
  const pipeline = new VisionPipeline({ delegate: 'CPU' })
  const loadingStart = performance.now()
  await pipeline.load({ face: true, hair: true, hands: true })
  const loadingMs = performance.now() - loadingStart
  document.body.style.cssText = 'background:#f3eee8;color:#29211f;font:18px sans-serif;margin:28px'
  document.body.innerHTML = '<h1>Local model verification</h1><p>Actual MediaPipe inference. Green points: face mesh. Magenta: hair confidence. Blue points: detected hands. This is an integration check, not a fairness or tracking-quality evaluation.</p>'
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:20px'; document.body.append(row)
  const results = []
  for (const name of ['portrait.jpg', 'portrait-2.jpg', 'portrait-3.jpg']) {
    const image = new Image(); image.src = '/images/' + name; await image.decode()
    const snapshot = await pipeline.analyzeImage(image, { face: true, hair: true, hands: true })
    const mask = snapshot.hairMask
    let min = 1, max = 0, sum = 0
    if (mask) for (const value of mask.data) { min = Math.min(min, value); max = Math.max(max, value); sum += value }
    const metrics = { name, width: image.naturalWidth, height: image.naturalHeight, faceLandmarks: snapshot.landmarks.length, blendshapes: Object.keys(snapshot.blendshapes).length, transform: snapshot.transform?.length, hairMask: mask ? { width: mask.width, height: mask.height, min, max, mean: sum / mask.data.length } : null, handCount: snapshot.hands.length, latencyMs: snapshot.latencyMs, status: structuredClone(snapshot.status) }
    results.push(metrics)
    const column = document.createElement('section'); column.style.flex = '1'; row.append(column)
    const title = document.createElement('h2'); title.textContent = name; column.append(title)
    const canvas = document.createElement('canvas'); canvas.width = 450; canvas.height = 650; canvas.style.width = '100%'; column.append(canvas)
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, 450, 650)
    if (mask) {
      const small = document.createElement('canvas'); small.width = mask.width; small.height = mask.height
      const sm = small.getContext('2d'); const data = sm.createImageData(mask.width, mask.height)
      for (let i = 0; i < mask.data.length; i++) { data.data[i * 4] = 220; data.data[i * 4 + 1] = 30; data.data[i * 4 + 2] = 180; data.data[i * 4 + 3] = mask.data[i] * 120 }
      sm.putImageData(data, 0, 0); ctx.drawImage(small, 0, 0, 450, 650)
    }
    ctx.fillStyle = '#77ff7a'; for (const p of snapshot.landmarks) { ctx.beginPath(); ctx.arc(p.x * 450, p.y * 650, 1.3, 0, 2 * Math.PI); ctx.fill() }
    ctx.fillStyle = '#55baff'; for (const hand of snapshot.hands) for (const p of hand.landmarks) { ctx.beginPath(); ctx.arc(p.x * 450, p.y * 650, 3, 0, 2 * Math.PI); ctx.fill() }
    const caption = document.createElement('p'); caption.textContent = `${snapshot.landmarks.length} face points · ${snapshot.hands.length} hand(s) · ${Math.round(snapshot.latencyMs)} ms`; column.append(caption)
  }
  pipeline.dispose()
  return { loadingMs, results }
})
await page.screenshot({ path: path.join(output, 'portrait-inference.png'), fullPage: true })
const evidence = { recordedAt: new Date().toISOString(), browser: browser.version(), platform: os.platform(), cpu: os.cpus()[0]?.model, viewport: { width: 1500, height: 1050 }, inference: 'CPU; headless Chromium; no GPU performance claim', ...result }
await writeFile(path.join(output, 'model-integration.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence, null, 2))
await browser.close()
if (result.results.some(r => r.faceLandmarks !== 478 || !r.hairMask || r.transform !== 16)) process.exitCode = 1
