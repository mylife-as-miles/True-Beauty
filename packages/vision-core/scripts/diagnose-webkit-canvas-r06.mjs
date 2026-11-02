import {webkit} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const out='packages/vision-core/evidence/r06';await mkdir(out,{recursive:true});
const browser=await webkit.launch({headless:true,executablePath:'/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh'});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.fulfill({status:503,json:{error:'No service API allowed in read-only model-input diagnostic'}}));
 await page.route('**/r06-canvas-diagnostic',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));await page.goto('http://127.0.0.1:5173/r06-canvas-diagnostic');
 const result=await page.evaluate(async()=>{
  const {createVision,VisionPipeline,VisionWorkerClient,getGraphicsCapabilities}=await import('/packages/vision-core/src/index.ts');
  const image=new Image();image.src='/images/portrait-2.jpg';await image.decode();
  const makeCanvas=(frequent=false)=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const x=c.getContext('2d',{willReadFrequently:frequent});x.drawImage(image,0,0,c.width,c.height);return c;};
  const raw=makeCanvas(),frequent=makeCanvas(true),bitmapImage=await createImageBitmap(image),bitmapCanvas=await createImageBitmap(frequent);
  const pixels=async source=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(source,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height).data,digest=await crypto.subtle.digest('SHA-256',data);let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i]+data[i+1]+data[i+2];return {hash:[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),mean:sum/(c.width*c.height*3),top:[...data.slice(0,12)],bottom:[...data.slice(-12)]};};
  const sources=[['image',image],['canvas',raw],['frequentCanvas',frequent],['bitmapImage',bitmapImage],['bitmapCanvas',bitmapCanvas]],pixelResults={};
  for(const [name,source]of sources)pixelResults[name]=await pixels(source);
  const tests=[];
  for(const mode of['factory','main']){
   const engine=mode==='factory'?createVision():new VisionPipeline({delegate:'CPU'});
   try{for(const [name,source]of sources){const began=performance.now();try{const s=await engine.analyzeImage(source,{face:true,hair:true,hands:true});tests.push({mode,name,face:s.landmarks.length,hands:s.hands.length,hair:s.hairMask?{width:s.hairMask.width,height:s.hairMask.height,mean:s.hairMask.data.reduce((a,b)=>a+b,0)/s.hairMask.data.length}:null,status:s.status,elapsedMs:performance.now()-began});}catch(error){tests.push({mode,name,error:String(error)});}}}finally{engine.dispose();}
  }
  bitmapImage.close();bitmapCanvas.close();return {capabilities:getGraphicsCapabilities(),workerSupported:VisionWorkerClient.supported(),source:[image.naturalWidth,image.naturalHeight],pixelResults,tests};
 });
 const evidence={recordedAt:new Date().toISOString(),browser:browser.version(),...result,limits:'WebKit WPE Linux software graphics; identical local portrait input variants, actual models. All service routes blocked. No source change or provider call.'};await writeFile(out+'/webkit-canvas-diagnostic.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
