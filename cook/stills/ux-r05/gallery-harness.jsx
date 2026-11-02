import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createVision,VisionPipeline,VisionWorkerClient} from '/packages/vision-core/src/index.ts';
import LookGallery from '/apps/web/src/components/LookGallery.tsx';
import '/apps/web/src/styles.css';
window.__galleryAnalysis={worker:0,main:0};
for(const [type,klass]of [['worker',VisionWorkerClient],['main',VisionPipeline]]){const analyze=klass.prototype.analyzeImage;klass.prototype.analyzeImage=function(...args){window.__galleryAnalysis[type]++;return analyze.apply(this,args)}}
function Harness(){const params=new URL(location.href).searchParams,mode=params.get('mode')??'standalone';const [active,setActive]=useState('soft-glow'),[portrait,setPortrait]=useState('/images/portrait-neutral.jpg'),[snapshot,setSnapshot]=useState(mode==='shared'||mode==='pending'?null:undefined);window.__gallerySetPortrait=setPortrait;window.__gallerySelected=active;
 useEffect(()=>{if(mode!=='shared')return;let alive=true;const img=new Image(),vision=createVision();img.onload=async()=>{const result=await vision.analyzeImage(img,{face:true,hair:false,hands:false});if(alive)setSnapshot(result)};img.src=portrait;return()=>{alive=false;vision.dispose()}},[mode,portrait]);
 return <main style={{maxWidth:params.has('compact')?230:1280,margin:'0 auto',padding:params.has('compact')?'28px 16px':'40px 24px',background:'var(--paper)',minHeight:'100vh'}}><p style={{fontSize:11,color:'#716469',marginBottom:26}}>Component verification · {mode==='shared'?'Shared real vision snapshot':mode==='pending'?'Shared tracking pending fixture':'Standalone real face analysis'}</p><LookGallery activeId={active} onSelect={setActive} portraitUrl={portrait} snapshot={snapshot} compact={params.has('compact')}/><p style={{marginTop:30,fontSize:12}}>Selected recipe: <output id="active-look">{active}</output></p></main>
}
createRoot(document.getElementById('root')).render(<Harness/>);
