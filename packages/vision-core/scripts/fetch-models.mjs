import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const output = path.join(root, 'apps/web/public/models')
await mkdir(output, { recursive: true })
const urls = {
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'hair_segmenter.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite',
  'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
}
const manifest = []
for (const [name, url] of Object.entries(urls)) {
  const target = path.join(output, name)
  // curl uses the inherited session proxy and CA trust, with verification enabled.
  execFileSync('curl', ['--fail', '--location', '--retry', '2', '--silent', '--show-error', url, '-o', target], { stdio: 'inherit' })
  const data = await readFile(target)
  manifest.push({ name, url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), retrievedAt: new Date().toISOString(), licenseAudit: 'Official Google solution asset; commercial model-card audit pending' })
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
const wasmSource = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmOutput = path.join(root, 'apps/web/public/wasm')
await mkdir(wasmOutput, { recursive: true })
for (const name of await readdir(wasmSource)) if (/\.(wasm|js)$/.test(name)) await copyFile(path.join(wasmSource, name), path.join(wasmOutput, name))
for (const name of ['LICENSE', 'NOTICE']) {
  try { await copyFile(path.join(root, 'node_modules/@mediapipe/tasks-vision', name), path.join(wasmOutput, name)) } catch { /* This installed package version may omit an optional NOTICE file. */ }
}
try { await readFile(path.join(wasmOutput, 'LICENSE')) } catch { execFileSync('curl', ['--fail','--location','--silent','--show-error','https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE','-o',path.join(wasmOutput,'LICENSE')], {stdio:'inherit'}) }
console.log('Fetched official face, hair and hand models and copied installed WASM runtime.')
