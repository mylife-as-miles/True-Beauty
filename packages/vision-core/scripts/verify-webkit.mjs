import {webkit} from '@playwright/test'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import os from 'node:os'
const root=fileURLToPath(new URL('../../../',import.meta.url));const output=path.join(root,'packages/vision-core/evidence');await mkdir(output,{recursive:true})
const origin=process.argv[2]??'http://127.0.0.1:5173'
const executablePath=process.env.TB_WEBKIT_EXECUTABLE??'/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh'
const browser=await webkit.launch({headless:true,executablePath,env:{...process.env,LIBGL_ALWAYS_SOFTWARE:'1',GALLIUM_DRIVER:'llvmpipe'}})
const page=await browser.newPage({viewport:{width:1280,height:900}})
await page.route(origin+'/webkit-vision',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await page.goto(origin+'/webkit-vision')
const result=await page.evaluate(async()=>{
 const {createVision,getGraphicsCapabilities}=await import('/packages/vision-core/src/index.ts')
 const capabilities=getGraphicsCapabilities();const engine=createVision();const results=[]
 try{
  await engine.load({face:true,hair:true,hands:true})
  for(const name of ['portrait-neutral.jpg','portrait-3.jpg']){
   const image=new Image();image.src='/images/'+name;await image.decode()
   const snapshot=await engine.analyzeImage(image,{face:true,hair:true,hands:true})
   results.push({name,points:snapshot.landmarks.length,blendshapes:Object.keys(snapshot.blendshapes).length,transform:snapshot.transform?.length,hair:[snapshot.hairMask?.width,snapshot.hairMask?.height],hands:snapshot.hands.length,latencyMs:snapshot.latencyMs,status:snapshot.status})
  }
 }catch(error){results.push({error:String(error)})}finally{engine.dispose()}
 return {capabilities,results,userAgent:navigator.userAgent,canvasCaptureStream:typeof document.createElement('canvas').captureStream}
})
let provisionedPackages=[];try{provisionedPackages=JSON.parse(await readFile('/tmp/true-beauty-browser-libs/manifest.json','utf8'))}catch{}
const evidence={recordedAt:new Date().toISOString(),browser:browser.version(),cpu:os.cpus()[0]?.model,platform:os.platform(),mode:'WebKit WPE headless, Mesa llvmpipe software graphics; unprivileged local library wrapper',...result,provisionedPackages,limitations:'Playwright WebKit on Linux is not Safari on real macOS/iOS hardware. No mobile/hardware FPS or fairness gate asserted.'}
await writeFile(path.join(output,'webkit-integration.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));await browser.close()
if(result.results.some(r=>r.points!==478||!r.hair?.[0]))process.exitCode=1
