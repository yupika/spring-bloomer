import { chromium } from 'playwright';
import http from 'http'; import { readFile } from 'fs/promises'; import path from 'path';
const ROOT='/home/ubuntu/apps/spring-bloomer';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const d=await readFile(path.join(ROOT,p));res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
for(const w of [800,932,1024]){
  const ctx=await browser.newContext({viewport:{width:w,height:430},deviceScaleFactor:2});
  const page=await ctx.newPage();
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(()=>{document.getElementById('solo-cta').open=true;});
  await page.waitForTimeout(150);
  await page.locator('button[data-players="2"]').click();
  await page.waitForTimeout(1500);
  const r=await page.evaluate(()=>{const n=document.getElementById('tab-nav');const cs=getComputedStyle(n);return{tabsShown:cs.display!=='none',mm900:matchMedia('(max-width:900px)').matches};});
  console.log(`W=${w}: tabsShown=${r.tabsShown} mm900=${r.mm900}`);
  await page.screenshot({path:`/tmp/w-${w}.png`});
  await ctx.close();
}
await browser.close();server.close();
