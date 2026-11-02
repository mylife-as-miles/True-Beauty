const CACHE='true-beauty-v1';
const PRECACHE=['/','/mark.svg','/images/portrait-neutral.jpg','/fonts/dm-sans-400.ttf','/fonts/dm-serif.ttf'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('true-beauty-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 const publicResource=url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/mark.svg'||['/assets/','/images/','/fonts/','/models/','/wasm/'].some(prefix=>url.pathname.startsWith(prefix));
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!publicResource)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response}).catch(async()=>{
  const cache=await caches.open(CACHE);
  // These are same-origin public immutable resources only. Vite preview adds
  // Vary: Origin; precache and crossorigin module requests differ in Origin.
  const hit=await cache.match(event.request,{ignoreVary:true});
  return hit||(event.request.mode==='navigate'?await cache.match('/',{ignoreVary:true}):null)||Response.error();
 }));
});
self.addEventListener('message',event=>{if(event.data==='CLEAR_APP_CACHE')event.waitUntil(caches.delete(CACHE))});
