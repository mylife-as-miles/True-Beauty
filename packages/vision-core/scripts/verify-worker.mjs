import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const output = path.join(root, 'packages/vision-core/evidence')
const origin = process.argv[2] ?? 'http://127.0.0.1:5174'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({viewport:{width:1280,height:900}})
await page.route(origin + '/worker-test', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }))
await page.goto(origin + '/worker-test')
const result = await page.evaluate(async () => {
  const { VisionWorkerClient } = await import('/packages/vision-core/src/index.ts')
  const worker = new VisionWorkerClient()
  await worker.load({ face: true, hair: true, hands: true })
  const image = new Image(); image.src = '/images/portrait.jpg'; await image.decode()
  let timerTicks = 0
  const timer = setInterval(() => timerTicks++, 10)
  const photo = await worker.analyzeImage(image, { face: true, hair: true, hands: true })
  clearInterval(timer)
  const photoMetrics = { landmarks: photo.landmarks.length, hairMask: [photo.hairMask?.width, photo.hairMask?.height], latencyMs: photo.latencyMs, mainThreadTimerTicks: timerTicks }
  const source = document.createElement('canvas'); source.width = 480; source.height = 600
  const ctx = source.getContext('2d'); ctx.drawImage(image, 0, 0, 480, 600)
  const stream = source.captureStream(30)
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream
  document.body.append(video); await video.play()
  let rafFrames = 0, lastTime = 0
  const renderIntervals = [], inferenceTimes = []
  let error = null, active = true, request = 0
  const begin = performance.now()
  function tick(time) {
    if (!active) return
    rafFrames++
    if (lastTime) renderIntervals.push(time-lastTime)
    lastTime=time
    ctx.drawImage(image, 0, 0, 480, 600)
    ctx.fillStyle = rafFrames % 2 ? '#333' : '#444'; ctx.fillRect(0, 0, 10, 10)
    if (!worker.isBusy) worker.analyzeVideo(video, time, { face: true, hair: true, hands: true }).then(snapshot => { if (snapshot.latencyMs > 1) inferenceTimes.push(snapshot.latencyMs) }).catch(failure => { error = String(failure) })
    request = requestAnimationFrame(tick)
  }
  request = requestAnimationFrame(tick)
  await new Promise(resolve => setTimeout(resolve, 4500))
  active=false;cancelAnimationFrame(request)
  while (worker.isBusy) await new Promise(resolve => setTimeout(resolve, 10))
  const elapsedMs = performance.now()-begin
  const final = worker.getSnapshot()
  stream.getTracks().forEach(track=>track.stop());video.srcObject=null;worker.dispose()
  const percentile = (values,percent) => { const list=[...values].sort((a,b)=>a-b);return list[Math.min(list.length-1,Math.floor(list.length*percent))]??0 }
  return { photo: photoMetrics, fakeVideo: { durationMs: elapsedMs, sourceResolution:[480,600], cameraStreamFrameRate:30, uiRafFrames:rafFrames, uiRafFPS:rafFrames/elapsedMs*1000, renderIntervalP50Ms:percentile(renderIntervals,.5),renderIntervalP95Ms:percentile(renderIntervals,.95),inferenceBatchP50Ms:percentile(inferenceTimes,.5),inferenceBatchP95Ms:percentile(inferenceTimes,.95),landmarks:final.landmarks.length,scheduler:final.scheduler,error,tracksStopped:stream.getTracks().every(track=>track.readyState==='ended') }, limitations:'Canvas-captureStream repeating a static portrait. This checks scheduling, actual video-mode inference and responsiveness, not moving-face stability, real camera/mobile FPS or long-run memory leaks.' }
})
const evidence={recordedAt:new Date().toISOString(),browser:browser.version(),cpu:os.cpus()[0]?.model,platform:os.platform(),...result}
await writeFile(path.join(output, 'worker-integration.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence,null,2))
await browser.close()
if(result.photo.landmarks!==478||result.photo.mainThreadTimerTicks<5||result.fakeVideo.landmarks!==478||result.fakeVideo.error||!result.fakeVideo.tracksStopped)process.exitCode=1
