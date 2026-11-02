import {chromium} from 'playwright-core';
import {browserExecutable} from './browser-executable';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const out=new URL('../evidence/provider-readiness/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const result:Record<string,unknown>={fixture:false,scope:'One live text/model mutation and one provider speech request through the regular tutor. No microphone/hardware-speaker acceptance.'};
try{const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
await context.addInitScript(`(() => {
 const NativeAudio=window.Audio;window.__petrosAudioRms=[];
 window.Audio=function(src){const audio=new NativeAudio(src);audio.addEventListener('playing',()=>{
  const ctx=new AudioContext(),stream=audio.captureStream?.();if(!stream?.getAudioTracks().length)return;
  const source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser(),silent=ctx.createGain();silent.gain.value=0;analyser.fftSize=1024;source.connect(analyser);analyser.connect(silent);silent.connect(ctx.destination);void ctx.resume();
  const timer=setInterval(()=>{const a=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(a);window.__petrosAudioRms.push(Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length));},80);
  const clean=()=>{clearInterval(timer);source.disconnect();analyser.disconnect();silent.disconnect();void ctx.close();};audio.addEventListener('ended',clean,{once:true});audio.addEventListener('emptied',clean,{once:true});
 },{once:true});return audio;};
})()`);
const page=await context.newPage();page.setDefaultTimeout(90000);await page.goto('http://127.0.0.1:3022/prototype?view=2d');await page.locator('#petros-observations').waitFor({state:'attached'});
result.configuration=await page.request.get('http://127.0.0.1:3022/prototype/api/status').then(r=>r.json());
await page.getByRole('button',{name:'Start learning with captions',exact:true}).click();await page.getByRole('button',{name:'Explore freely',exact:true}).click();
const question='Set the input x1 to -1. Explain what changed in the prediction.';await page.getByLabel('Ask Petros',{exact:true}).fill(question);const textPending=page.waitForResponse(r=>r.url().endsWith('/teacher'),{timeout:120000});await page.getByRole('button',{name:'Send question',exact:true}).click();const textResponse=await textPending;result.textHttpStatus=textResponse.status();const text=await textResponse.json();
if(textResponse.ok()){await page.waitForFunction(()=>JSON.parse(document.querySelector('#petros-observations')!.textContent!).params.x1===-1);result.textSucceeded=true;result.inputAfter=text.state.params.x1;result.caption=await page.locator('[data-phase]').textContent();}else{result.textSucceeded=false;result.textError=text.error;result.textErrorCode=text.code;}
const speechPending=page.waitForResponse(r=>r.url().endsWith('/speech'),{timeout:45000});await page.getByRole('button',{name:'Read aloud',exact:true}).click();const speechResponse=await speechPending;result.speechHttpStatus=speechResponse.status();result.speechContentType=speechResponse.headers()['content-type'];
if(speechResponse.ok()){result.speechBytes=(await speechResponse.body()).length;await page.waitForFunction(()=>((window as any).__petrosAudioRms??[]).some((x:number)=>x>.005),undefined,{timeout:15000});result.audibleSignalRms=await page.evaluate(()=>Math.max(...(window as any).__petrosAudioRms));result.speechSucceeded=true;}else{result.speechSucceeded=false;result.speechError='Provider speech request failed; inspect the server/provider diagnostic.';}
await page.getByRole('button',{name:'Pause Petros',exact:true}).click();await page.screenshot({path:fileURLToPath(new URL('regular-tutor-dpr2.png',out)),fullPage:true});
}catch(e){result.checkError=String(e);}finally{await writeFile(new URL('results.json',out),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
