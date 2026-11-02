import { chromium } from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const directory=new URL('./stills/r05-final/',import.meta.url);await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true});const records=[];
for(const [width,height] of [[1440,900],[1366,768],[768,1024],[390,844]]){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[],posts=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
 await page.goto('http://127.0.0.1:4173');await page.locator('.mirror-state').getByText('Face mesh connected',{exact:true}).waitFor({timeout:45000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.querySelector('.look-gallery')?.getAttribute('data-preview-state')==='ready');
 await page.screenshot({path:new URL(`studio-${width}.png`,directory).pathname});
 const geometry=await page.locator('.mirror-frame,.atelier').evaluateAll(nodes=>nodes.map(n=>({class:n.className,bounds:n.getBoundingClientRect().toJSON()})));
 if(width===1440){
  await page.getByRole('button',{name:'Light',exact:true}).click();await page.getByRole('button',{name:'Golden',exact:true}).click();await page.screenshot({path:new URL('golden-light-desktop.png',directory).pathname});
  await page.getByRole('button',{name:'Focus mirror',exact:true}).click();await page.screenshot({path:new URL('focused-desktop.png',directory).pathname});
  await page.getByRole('button',{name:'Leave focus',exact:true}).click();await page.getByRole('button',{name:'Show full portrait',exact:true}).click();await page.screenshot({path:new URL('full-portrait-desktop.png',directory).pathname});
  await page.getByRole('button',{name:'Inspiration canvas',exact:true}).click();await page.locator('.canvas-viewport[aria-busy=false]').waitFor();await page.screenshot({path:new URL('canvas-desktop.png',directory).pathname});
 }
 if(width===390){await page.getByRole('button',{name:'The look edit',exact:true}).click();await page.getByRole('button',{name:'Next look',exact:true}).click();await page.screenshot({path:new URL('look-gallery-mobile.png',directory).pathname})}
 records.push({viewport:{width,height},browser:browser.version(),geometry,errors,posts,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await context.close();
}
await writeFile(new URL('report.json',directory),JSON.stringify(records,null,2));await browser.close();
