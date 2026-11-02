import {firefox} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../../',import.meta.url));const output=path.join(root,'packages/vision-core/evidence');await mkdir(output,{recursive:true})
const browser=await firefox.launch({headless:false,env:{...process.env,DISPLAY:process.env.DISPLAY??':99',LIBGL_ALWAYS_SOFTWARE:'1',GALLIUM_DRIVER:'llvmpipe',MOZ_WEBRENDER:'1'},firefoxUserPrefs:{'webgl.force-enabled':true,'webgl.disabled':false,'gfx.webrender.software':true}})
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}})
let release,started;const gate=new Promise(r=>release=r),requestStarted=new Promise(r=>started=r)
await context.route('**/models/face_landmarker.task',async route=>{started();await gate;await route.continue()})
const page=await context.newPage();await page.goto(process.argv[2]??'http://127.0.0.1:5173')
await Promise.race([requestStarted,new Promise((_,reject)=>setTimeout(()=>reject(new Error('model request not intercepted')),15000))])
await page.locator('.source-bar input[type=file]').setInputFiles(path.join(root,'apps/web/public/images/portrait-2.jpg'))
const beforeRelease={source:await page.locator('.mirror-label').textContent(),status:await page.locator('.mirror-state').textContent()}
release()
await page.locator('.mirror-state').filter({hasText:'Face mesh connected'}).waitFor({timeout:30000})
const result={recordedAt:new Date().toISOString(),browser:browser.version(),serviceWorkers:'blocked solely for deterministic interception fixture',modelRequestHeld:true,beforeRelease,afterRelease:{source:await page.locator('.mirror-label').textContent(),status:await page.locator('.mirror-state').textContent(),latency:await page.locator('.mirror-footnote').textContent()}}
await page.screenshot({path:path.join(output,'firefox-source-switch.png'),fullPage:true});await writeFile(path.join(output,'firefox-source-switch.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close()
