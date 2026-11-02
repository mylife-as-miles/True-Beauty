import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve('cook/stills/r06-critic-visual');
const browser=await chromium.launch({headless:true});
const report={date:new Date().toISOString(),browser:browser.version(),surfaces:[],errors:[],postRequests:[]};
async function nav(p,name){const menu=p.getByRole('button',{name:'Open navigation',exact:true});if(await menu.isVisible()){await menu.click();await p.locator('.nav-rail').getByRole('button',{name,exact:true}).click();}else{const top=p.locator('.topnav').getByRole('button',{name,exact:true});if(await top.isVisible())await top.click();else await p.locator('.nav-rail').getByRole('button',{name,exact:true}).click();}await p.waitForTimeout(250);}
async function shot(p,name,full=false){await p.screenshot({path:path.join(dir,name+'.png'),fullPage:full});}
async function geom(p,label){report.surfaces.push({label,...await p.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,controls:[...document.querySelectorAll('button,input,select,summary')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden').map(e=>{const r=e.getBoundingClientRect();return {text:e.getAttribute('aria-label')||e.innerText||e.name||e.type,rect:{x:r.x,y:r.y,w:r.width,h:r.height},disabled:e.disabled}})}))});}
for(const [label,width,height]of[['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:label==='mobile'?'reduce':'no-preference'}),p=await ctx.newPage();p.setDefaultTimeout(12000);
 p.on('pageerror',e=>report.errors.push({label,error:e.message}));
 await p.route('**/*',async route=>{if(route.request().method()==='POST'){report.postRequests.push({label,url:route.request().url()});await route.abort();}else await route.continue();});
 await p.goto('http://127.0.0.1:5173/');
 await p.locator('.mirror-state').filter({hasText:'Face mesh connected'}).waitFor({timeout:60000});
 await p.waitForTimeout(800);await shot(p,label+'-mirror');await geom(p,label+'-mirror');
 await p.getByRole('button',{name:'Style',exact:true}).click();
 for(const a of ['glasses','earrings','necklace','hat','scarf','wristband','ring']){const c=p.getByRole('checkbox',{name:'Preview '+a,exact:true});if(await c.count())await c.check();}
 await p.waitForTimeout(3500);await p.evaluate(()=>scrollTo(0,0));await shot(p,label+'-style');await geom(p,label+'-style');
 await p.getByRole('button',{name:'Show full portrait',exact:true}).click();await p.waitForTimeout(500);await shot(p,label+'-style-full-portrait');
 await nav(p,'Look Remix');await shot(p,label+'-remix-empty');
 await p.getByLabel('Inspiration photograph',{exact:true}).setInputFiles(path.resolve('apps/web/public/images/portrait-2.jpg'));
 await p.getByRole('button',{name:'Interpret this reference',exact:true}).click();
 await p.locator('.look-remix').waitFor({timeout:1000}).catch(()=>{});
 await p.getByRole('button',{name:'Apply this interpretation',exact:true}).waitFor({timeout:60000});
 await p.waitForTimeout(600);await p.evaluate(()=>scrollTo(0,0));await shot(p,label+'-remix-result');await shot(p,label+'-remix-result-full',true);await geom(p,label+'-remix-result');
 const hair=p.getByRole('button',{name:/Hair.*sample|Hair.*measured|Hair.*colour/i});
 const tabs=await p.locator('.remix-region-tabs button').allTextContents().catch(()=>[]);console.log(label+' remix tabs '+JSON.stringify(tabs));
 const hairButton=p.locator('.remix-regions button,.remix-region-tabs button').filter({hasText:'Hair'}).first();if(await hairButton.count())await hairButton.click();
 const regionButtons=await p.locator('[aria-label="Sampled image regions"] button').allTextContents();console.log(label+' regions '+JSON.stringify(regionButtons));
 const target=p.locator('[aria-label="Sampled image regions"] button').filter({hasText:'Hair'}).first();if(await target.count())await target.click();
 await p.getByLabel('Hair colour correction',{exact:true}).fill('#913c91').catch(()=>{});await shot(p,label+'-remix-hair',true);
 const apply=p.getByRole('button',{name:'Apply this interpretation',exact:true});await apply.scrollIntoViewIfNeeded();await shot(p,label+'-remix-apply');await apply.click();
 await p.getByRole('button',{name:'Back to your mirror',exact:true}).click();await p.waitForTimeout(1000);await shot(p,label+'-remix-return');await geom(p,label+'-remix-return');
 await nav(p,'Beauty profile');await p.getByRole('heading',{name:/A little more you|The story|Beauty|A portrait|A profile/i}).first().waitFor({timeout:3000}).catch(()=>{});await p.waitForTimeout(400);await shot(p,label+'-profile');await shot(p,label+'-profile-full',true);await geom(p,label+'-profile');
 await nav(p,'My wardrobe');await p.getByRole('button',{name:'Dressing room',exact:true}).click();await p.getByRole('heading',{name:'Wear the feeling.',exact:true}).waitFor();await p.waitForTimeout(500);await shot(p,label+'-dressing');await shot(p,label+'-dressing-full',true);await geom(p,label+'-dressing');
 await p.getByRole('slider',{name:'Width',exact:true}).fill('0.65');await p.getByRole('slider',{name:'Rotation',exact:true}).fill('8');await p.getByRole('button',{name:'Choose garment colour #d2bc9c',exact:true}).click();await shot(p,label+'-dressing-edited',true);
 await nav(p,'The beauty edit');await shot(p,label+'-commerce');await shot(p,label+'-commerce-full',true);await geom(p,label+'-commerce');
 await p.getByRole('button',{name:'View O FACE Satin Lipstick',exact:true}).click();await p.getByRole('button',{name:'Soft rose',exact:true}).click();await shot(p,label+'-product');await geom(p,label+'-product');await p.getByRole('button',{name:'Add to bag',exact:true}).click();await p.getByRole('button',{name:'Berry muse',exact:true}).click();await p.getByRole('button',{name:'Add to bag',exact:true}).click();await p.getByRole('button',{name:'Close dialog',exact:true}).click();await p.getByRole('button',{name:/Your bag/}).click();await shot(p,label+'-bag');await geom(p,label+'-bag');
 await ctx.close();await fs.writeFile(path.join(dir,'browser-report.json'),JSON.stringify(report,null,2));console.log(label+' complete');
}
await browser.close();await fs.writeFile(path.join(dir,'browser-report.json'),JSON.stringify(report,null,2));
