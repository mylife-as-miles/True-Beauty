import { firefox } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const output = path.join(root, 'packages/vision-core/evidence')
const origin = process.argv[2] ?? 'http://127.0.0.1:5173'
await mkdir(output, { recursive: true })
const results=[]
for(const useDisplay of [false,true]){
  const browser=await firefox.launch({headless:!useDisplay,...(useDisplay?{env:{...process.env,DISPLAY:process.env.DISPLAY??':99',LIBGL_ALWAYS_SOFTWARE:'1',GALLIUM_DRIVER:'llvmpipe',MOZ_WEBRENDER:'1'},firefoxUserPrefs:{'webgl.force-enabled':true,'webgl.disabled':false,'gfx.webrender.software':true}}:{})})
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  await page.route(origin+'/ff-vision',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}))
  await page.goto(origin+'/ff-vision')
  const result=await page.evaluate(async()=>{
    const {createVision,getGraphicsCapabilities}=await import('/packages/vision-core/src/index.ts')
    const capabilities=getGraphicsCapabilities()
    const actual=createVision()
    const started=performance.now()
    let result
    try{
      await actual.load({face:true,hair:true,hands:true})
      const image=new Image();image.src='/images/portrait-neutral.jpg';await image.decode()
      const snapshot=await actual.analyzeImage(image,{face:true,hair:true,hands:true})
      result={points:snapshot.landmarks.length,blendshapes:Object.keys(snapshot.blendshapes).length,hair:[snapshot.hairMask?.width,snapshot.hairMask?.height],hands:snapshot.hands.length,latencyMs:snapshot.latencyMs,status:snapshot.status}
    }catch(error){result={error:String(error)}}finally{actual.dispose()}
    let fallback=null
    if(capabilities.webgl){
      const OriginalWorker=window.Worker
      // Deliberately failed worker transport; fallback must execute the real main-thread models.
      window.Worker=class BrokenWorker{onerror;postMessage(){setTimeout(()=>this.onerror?.({message:'Intentional worker-only transport failure'}),0)}terminate(){}}
      const engine=createVision()
      try{
        await engine.load({face:true,hair:true})
        const image=new Image();image.src='/images/portrait-neutral.jpg';await image.decode()
        const snapshot=await engine.analyzeImage(image,{face:true,hair:true})
        fallback={points:snapshot.landmarks.length,hair:[snapshot.hairMask?.width,snapshot.hairMask?.height],status:snapshot.status}
      }catch(error){fallback={error:String(error)}}finally{engine.dispose();window.Worker=OriginalWorker}
    }
    return {capabilities,result,fallback,elapsedMs:performance.now()-started}
  })
  results.push({mode:useDisplay?'Xvfb :99 + Mesa llvmpipe, headed software graphics':'default headless (no usable GL driver)',browser:browser.version(),...result})
  await browser.close()
}
const evidence={recordedAt:new Date().toISOString(),cpu:os.cpus()[0]?.model,platform:os.platform(),results,limitations:'Software graphics/Xvfb is a test environment, not measured hardware performance. Default headless Firefox lacks usable GL here. A deliberate worker failure tests real main-thread fallback; its successful model output is not mocked.'}
await writeFile(path.join(output,'firefox-integration.json'),JSON.stringify(evidence,null,2))
console.log(JSON.stringify(evidence,null,2))
const software=results[1]
if(software.result.points!==478||software.fallback?.points!==478||!software.result.hair?.[0])process.exitCode=1
