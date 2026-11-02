import {chromium} from 'playwright-core';import {browserExecutable} from './browser-executable';import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});const started=Date.now();await page.goto('http://127.0.0.1:3022/prototype');await page.locator('#petros-observations').waitFor({state:'attached'});const interactiveMs=Date.now()-started;
 await page.getByRole('button',{name:'Explore World ↗',exact:true}).click();await page.getByRole('button',{name:'Visit Traffic Control Table',exact:true}).click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.travelling==='false');
 const frames=await page.evaluate(()=>new Promise<number[]>(resolve=>{const times:number[]=[];let prior=performance.now(),start=prior;function tick(now:number){times.push(now-prior);prior=now;if(now-start>3000)resolve(times);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
 const sorted=frames.slice(2).sort((a,b)=>a-b);const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter((r:any)=>/\/atelier\//.test(r.name)).map((r:any)=>({file:r.name.split('/atelier/')[1],bytes:r.decodedBodySize,durationMs:r.duration})));
 const result={scope:'Local headless Brave, development build, 1366×768. Browser frame intervals, not physical low-end-device or deployed performance.',interactiveMs,frameMedianMs:sorted[Math.floor(sorted.length/2)],frameP95Ms:sorted[Math.floor(sorted.length*.95)],sampleFrames:sorted.length,resources};
 await writeFile(new URL('../evidence/corrective/performance.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
