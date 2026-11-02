import {webkit} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const overrideMode=process.argv[2]??'instance';
const origin='http://127.0.0.1:5173',out='packages/vision-core/evidence/r06';await mkdir(out,{recursive:true});
const browser=await webkit.launch({executablePath:'/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh',headless:true});
try{
 const page=await browser.newPage(),pageErrors=[],consoleErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().slice(0,300));});
 await page.route('**/api/**',route=>route.fulfill({status:503,json:{error:'All service calls blocked by read-only camera diagnostic'}}));
 await page.addInitScript((overrideMode)=>{
  const record={secureContext:isSecureContext,url:location.href,devicesPresent:!!navigator.mediaDevices,captureStream:typeof HTMLCanvasElement.prototype.captureStream,overrideInstalled:false,invocations:[],failure:null};
  Object.assign(window,{__r06WebkitCameraDiagnostic:record});
  try{
   Object.defineProperty(overrideMode==='prototype'?Object.getPrototypeOf(navigator.mediaDevices):navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
    record.invocations.push({at:performance.now(),devicesSame:navigator.mediaDevices.getUserMedia.toString().includes('record.invocations')});
    const c=document.createElement('canvas');c.width=480;c.height=720;const ctx=c.getContext('2d');ctx.fillStyle='#999';ctx.fillRect(0,0,480,720);
    try{const stream=c.captureStream(15);Object.assign(window,{__r06CameraStream:stream});return stream;}catch(error){record.failure={name:error.name,message:error.message};throw error;}
   }});record.overrideInstalled=true;
  }catch(error){record.failure={name:error.name,message:error.message};}
 },overrideMode);
 await page.goto(origin);
 await page.locator('.mirror-state').filter({hasText:'Face mesh connected'}).waitFor({timeout:45000});
 const before=await page.evaluate(()=>({initial:window.__r06WebkitCameraDiagnostic,now:{secureContext:isSecureContext,devicesPresent:!!navigator.mediaDevices,getUserMedia:String(navigator.mediaDevices?.getUserMedia),captureStream:typeof HTMLCanvasElement.prototype.captureStream}}));
 await page.getByRole('button',{name:'Open camera',exact:true}).click();
 await page.waitForFunction(()=>window.__r06WebkitCameraDiagnostic?.invocations.length||document.querySelector('[role="alert"]'));
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2||document.querySelector('[role="alert"]'));
 const after=await page.evaluate(()=>({diagnostic:window.__r06WebkitCameraDiagnostic,alert:document.querySelector('[role="alert"]')?.textContent,stream:window.__r06CameraStream?{active:window.__r06CameraStream.active,tracks:window.__r06CameraStream.getTracks().map(t=>({kind:t.kind,state:t.readyState}))}:null,video:document.querySelector('video')?{readyState:document.querySelector('video').readyState,error:document.querySelector('video').error?.message}:null}));
 if(after.stream?.active){await page.getByRole('button',{name:'Stop camera',exact:true}).click();after.tracksAfterStop=await page.evaluate(()=>window.__r06CameraStream.getTracks().map(t=>t.readyState));}
 const result={overrideMode,recordedAt:new Date().toISOString(),browser:browser.version(),before,after,pageErrors,consoleErrors,limits:'WebKit WPE headless Linux with software GL and local dependency wrapper; controlled fixture only, not physical-camera proof. All service API routes blocked.'};
 await writeFile(out+`/webkit-camera-${overrideMode}-diagnostic.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
