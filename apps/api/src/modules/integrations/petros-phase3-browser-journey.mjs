/* global window, queueMicrotask, setTimeout, innerWidth, document, console, process */
import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
let activeBrowser;
let activePage;
const out=path.resolve(__dirname,'../../../../../docs/verification/petros-phase3-20260928');
async function main(){
 const meta=JSON.parse(fs.readFileSync('/tmp/petros-phase3-browser.json','utf8'));
 const browser=activeBrowser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:meta.cookieName,value:meta.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);
 await context.addInitScript(()=>{
  window.__speechRecords=[];window.__speechCancels=0;
  window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
    cancel(){window.__speechCancels++;},
    speak(utterance){window.__speechRecords.push(utterance.text);queueMicrotask(()=>utterance.onboundary?.({charIndex:20,elapsedTime:2}));}
  }});
 });
 const page=activePage=await context.newPage(),errors=[],record=[];
 page.on('pageerror',e=>errors.push(e.message));
 let selected={sessionId:meta.sessionId,blockId:meta.blockId};
 const endpoint=()=>`${meta.api}/student/petros/sessions/${selected.sessionId}/blocks/${selected.blockId}/workspace`;
 const state=async()=>{const response=await context.request.get(endpoint());assert.equal(response.status(),200);return (await response.json());};
 const waitState=async predicate=>{const deadline=Date.now()+15000;while(Date.now()<deadline){const value=await state();if(predicate(value))return value;await new Promise(r=>setTimeout(r,50));}throw Error('Workspace state predicate timed out');};
 const workspace=()=>page.getByRole('region',{name:'Petros program workspace'}).first();
 const version=async()=> (await state()).snapshot.execution.version;
 const action=async(fn,label)=>{const previous=await version();await fn();await waitState(s=>s.snapshot?.execution.version>previous);await page.waitForFunction(()=>{const control=document.querySelector('section[aria-label="Petros program workspace"] button[aria-controls="petros-expanded-scene"]');return control&&!control.disabled;});const next=await state();await workspace().getByText(new RegExp(`· state ${next.snapshot.execution.version}$`)).waitFor();await workspace().getByText('Scene action saved.',{exact:true}).waitFor();record.push({label,version:next.snapshot.execution.version,branch:next.snapshot.execution.branchId,time:next.snapshot.execution.time});return next;};
 await page.goto(meta.url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('button',{name:'Start scene',exact:true}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Start scene',exact:true}).click();
 await waitState(s=>s.status==='available');
 await workspace().getByRole('heading',{name:'Projectile motion',exact:true}).waitFor();
 const start=(await state()).snapshot;
 // Keyboard selection is an alternative to direct manipulation.
 const point=workspace().getByRole('button',{name:'Current model position',exact:true}).first();
 await point.focus();await action(()=>page.keyboard.press('Enter'),'keyboard semantic selection');
 assert.equal((await state()).snapshot.presentation.selectedEntityId,'body');
 await action(()=>workspace().getByRole('button',{name:'Isolate',exact:true}).click(),'isolate');
 assert((await state()).snapshot.presentation.hidden.includes('vectors'));
 await action(()=>workspace().getByRole('button',{name:'Vectors and forces',exact:true}).click(),'linked representation');
 assert.equal((await state()).snapshot.execution.time,0);
 await action(()=>workspace().getByRole('button',{name:'Restore view',exact:true}).click(),'restore wider lesson');
 await action(()=>workspace().getByRole('button',{name:'Next beat',exact:true}).click(),'apex model event');
 let s=(await state()).snapshot;
 assert(Math.abs(s.execution.values['model.vy'])<1e-10);assert.equal(s.execution.time,s.execution.values['model.apexTime']);
 assert.equal(s.execution.values['model.vx'],s.execution.parameters.vx);
 await workspace().getByRole('textbox',{name:'My notes',exact:true}).fill('Horizontal motion continues at the apex.');
 await action(()=>workspace().getByRole('button',{name:'Save notes',exact:true}).click(),'save draft');
 const saved=(await state()).snapshot;
 await workspace().getByRole('button',{name:'Speak',exact:true}).click();
 await workspace().getByText(/character 20 of/).waitFor();
 await action(()=>workspace().getByRole('button',{name:'Interrupt and freeze',exact:true}).click(),'interrupt confirmed narration boundary');
 const interrupted=(await state()).snapshot;
 assert.equal(interrupted.teaching.character,20);assert.equal(interrupted.teaching.offset,2);assert.equal(interrupted.teaching.interrupted,true);assert.equal(interrupted.execution.playing,false);
 await action(()=>workspace().getByRole('button',{name:'Expand',exact:true}).click(),'expand shared workspace');
 const modal=page.getByRole('dialog',{name:'Expanded Petros scene'});
 await modal.waitFor({state:'visible'});
 assert.equal(await modal.getByRole('textbox',{name:'My notes',exact:true}).inputValue(),saved.draft.text);
 await action(()=>modal.getByRole('button',{name:'Resume explanation',exact:true}).click(),'resume same return point');
 const speech=await page.evaluate(()=>window.__speechRecords);assert.equal(speech[1],speech[0].slice(20));
 s=(await state()).snapshot;assert.equal(s.teaching.offset,interrupted.teaching.offset);assert.equal(s.teaching.character,interrupted.teaching.character);assert.equal(s.execution.branchId,interrupted.execution.branchId);
 await action(()=>modal.getByRole('button',{name:'Return to lesson',exact:true}).click(),'return to original lesson');
 await modal.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='Expand');
 assert.equal((await state()).snapshot.draft.text,saved.draft.text);
 // Parameter changes recompute the shared model without any provider endpoint.
 const parameter=workspace().getByLabel(/^vx /);
 await action(async()=>{await parameter.fill('13');await parameter.press('Tab');},'projectile parameter');
 assert.equal((await state()).snapshot.execution.parameters.vx,13);
 assert.equal((await state()).snapshot.execution.time,0);
 assert(await workspace().getByRole('button',{name:'Advance one step',exact:true}).isVisible());
 await workspace().getByLabel('Allow continuous simulation motion',{exact:true}).check();
 await action(()=>workspace().getByRole('button',{name:'Play',exact:true}).click(),'explicit continuous-motion opt-in');
 await page.waitForFunction(()=>{const text=document.querySelector('section[aria-label="Current learning scene"] span')?.textContent??'';return Number(text.match(/· ([\d.]+) s/)?.[1])>.2;});
 const observed=Number((await page.getByRole('region',{name:'Current learning scene'}).locator('span').first().innerText()).match(/· ([\d.]+) s/)[1]);
 const switched=await action(()=>workspace().getByRole('button',{name:'Vectors and forces',exact:true}).click(),'representation preserves live observed time');
 assert(switched.snapshot.execution.time>=observed-.02);assert.equal(switched.snapshot.execution.playing,true);
 await action(()=>workspace().getByRole('button',{name:'Pause',exact:true}).click(),'pause acknowledges observed time');
 await action(()=>workspace().getByRole('button',{name:'Start',exact:true}).click(),'analytic return to initial time');
 await workspace().getByLabel('Allow continuous simulation motion',{exact:true}).uncheck();
 // Drop the HTTP response only after the owner has committed, then use the exact retry.
 let lostPayload;
 await page.route(endpoint(),async route=>{const request=route.request();if(request.method()==='PUT'&&JSON.parse(request.postData()).action.type==='step'){
   lostPayload=JSON.parse(request.postData());const committed=await route.fetch();console.log(JSON.stringify({lostResponseStatus:committed.status(),expectedVersion:lostPayload.expectedExperimentVersion}));assert.equal(committed.status(),200);await route.abort('failed');await page.unroute(endpoint());
 }else await route.continue();});
 const beforeLost=await version();await workspace().getByRole('button',{name:'Step',exact:true}).click();
 await waitState(s=>s.snapshot.execution.version===beforeLost+1);
 await workspace().getByText(/The action may have saved:/).waitFor();
 await workspace().getByRole('button',{name:'Retry exact action',exact:true}).waitFor();
 assert.equal(await version(),beforeLost+1);
 await workspace().getByRole('button',{name:'Retry exact action',exact:true}).click();
 await workspace().getByRole('button',{name:'Retry exact action',exact:true}).waitFor({state:'hidden'});
 assert.equal(await version(),beforeLost+1);
 record.push({label:'lost response and exact retry',version:await version(),operationId:lostPayload.operationId});
 const stale=await context.request.put(endpoint(),{data:{...lostPayload,operationId:crypto.randomUUID()}});
 assert.equal(stale.status(),409);record.push({label:'stale-version denial',status:stale.status()});
 const valid=(await state()).snapshot;
 const badUnit=await context.request.put(endpoint(),{data:{...lostPayload,operationId:crypto.randomUUID(),
   expectedExperimentVersion:valid.execution.version,expectedRevision:valid.program.revision,expectedDraftVersion:valid.draft.version,
   action:{type:'set_parameter',parameterId:'vx',value:13,unit:'ohm'}}});
 assert.equal(badUnit.status(),400);assert.equal(await version(),valid.execution.version);
 record.push({label:'real HTTP invalid-unit denial without write',status:badUnit.status()});
 await workspace().locator('summary',{hasText:'Compare experiment branches'}).click();
 const branchBefore=(await state()).snapshot.execution.branchId;
 await action(()=>workspace().getByRole('button',{name:/Compare with state 1,/}).click(),'branch from owner checkpoint');
 assert.notEqual((await state()).snapshot.execution.branchId,branchBefore);
 assert.equal((await state()).snapshot.draft.text,saved.draft.text);
 // The server returns a hidden prompt and computes the outcome only after the observation response.
 await workspace().getByRole('button',{name:'Request prediction prompt',exact:true}).click();
 await workspace().getByText(/Before advancing the model, predict/).waitFor();
 const prediction=workspace().getByRole('region',{name:'Prediction check'});
 await prediction.getByLabel(/My prediction/).fill('2');
 await prediction.getByLabel('Help used for prediction').selectOption('unknown');
 await prediction.getByRole('button',{name:'Check prediction',exact:true}).click();
 await prediction.getByText(/No mastery was admitted/).waitFor();
 record.push({label:'prediction before server outcome',eligibility:'observation_only',mastery:false});
 // Full application and browser UI for all trusted reference models.
 for(const capabilityId of ['physics.pendulum.ideal','circuits.dc.series','circuits.rc.series','render.spatial','held-out.combined']){
   selected=meta.examples[capabilityId];
   await page.goto(`${meta.web}/petros/session?session=${selected.sessionId}`,{waitUntil:'domcontentloaded',timeout:30000});
   await workspace().getByRole('heading',{level:3}).waitFor();
   await waitState(value=>value.status==='available');
   if(capabilityId==='physics.pendulum.ideal'){
     await action(()=>workspace().getByRole('button',{name:'Step',exact:true}).click(),'pendulum step');
     const old=(await state()).snapshot;
     await action(async()=>{const mass=workspace().getByLabel(/^mass /);await mass.fill('2');await mass.press('Tab');},'pendulum mass restart');
     const massState=(await state()).snapshot;assert.equal(massState.execution.time,0);assert.equal(massState.execution.values['model.angle'],old.execution.parameters.angle);
     assert.equal(massState.execution.values['model.weight'],2*massState.execution.parameters.gravity);
   }else if(capabilityId.startsWith('circuits.')){
     await action(()=>workspace().getByRole('button',{name:'Step',exact:true}).click(),capabilityId+' step');
     await action(()=>workspace().getByLabel(/^closed /).selectOption('false'),capabilityId+' switching');
     assert.equal((await state()).snapshot.execution.values['model.current'],0);
     assert.equal((await state()).snapshot.execution.inputEvents.length,1);
     assert.equal(await workspace().getByLabel(/^closed /).inputValue(),'false');
     await action(()=>workspace().getByRole('button',{name:'Step',exact:true}).click(),capabilityId+' advance open');
     await action(()=>workspace().getByLabel(/^closed /).selectOption('true'),capabilityId+' reclose');
     assert.equal(await workspace().getByLabel(/^closed /).inputValue(),'true');
     assert((await state()).snapshot.execution.values['model.current']>0);
     assert.equal((await state()).snapshot.execution.inputEvents.length,2);
     const time=workspace().getByLabel('Time (s)',{exact:true});
     await action(async()=>{await time.fill('0.15');await time.press('Tab');},capabilityId+' rewind through switch history');
     assert.equal(await workspace().getByLabel(/^closed /).inputValue(),'false');
     assert.equal((await state()).snapshot.execution.values['model.current'],0);
   }else if(capabilityId==='render.spatial'){
     const depth=workspace().getByRole('button',{name:/depth: x 80, y 160, depth 80 display px/}).first();
     await depth.focus();await action(()=>page.keyboard.press('Enter'),'spatial keyboard alternative');
     assert.equal((await state()).snapshot.presentation.selectedEntityId,'depth');
   }else{
     await action(()=>workspace().getByRole('button',{name:'Step',exact:true}).click(),'unfamiliar combined program');
     const mixed=(await state()).snapshot;
     assert.equal(mixed.program.models.length,2);
     assert(mixed.execution.values['flight.y']>0);
     assert(mixed.execution.values['loop.current']>0);
   }
   await page.screenshot({path:path.join(out,'browser-'+capabilityId.replaceAll('.','-')+'.png'),fullPage:true});
   await page.screenshot({path:path.join(out,'browser-'+capabilityId.replaceAll('.','-')+'-viewport.png')});
 }
 // The projector scene is a duration-zero demonstration. Return to the original shared lesson for mobile.
 selected={sessionId:meta.sessionId,blockId:meta.blockId};
 await page.goto(meta.url,{waitUntil:'domcontentloaded'});
 // The lesson owner saves and pauses on navigation. Resume that owner before
 // refreshing the last acknowledged workspace; its authority remains required.
 await page.getByRole('button',{name:'Resume',exact:true}).click();
 await page.getByRole('button',{name:'Save and pause',exact:true}).waitFor();
 await workspace().getByRole('button',{name:'Refresh scene',exact:true}).click();
 await workspace().getByRole('heading',{name:'Projectile motion',exact:true}).waitFor();
 assert.equal((await state()).snapshot.draft.text,saved.draft.text);
 record.push({label:'lesson-owner resume after navigation',draftRetained:true});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Close Petros conversation',exact:true}).click();
 await action(()=>workspace().getByRole('button',{name:'Expand',exact:true}).click(),'mobile expanded scene');
 await page.getByRole('dialog',{name:'Expanded Petros scene'}).waitFor({state:'visible'});
 const dimensions=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));
 assert(dimensions.page<=dimensions.viewport+2,JSON.stringify(dimensions));
 await page.screenshot({path:path.join(out,'browser-mobile.png')});
 const report={date:new Date().toISOString(),browser:await browser.version(),viewport:[1440,1000],mobile:[390,844],reducedMotion:true,realAppModule:true,disposablePostgresRedis:true,controlledProvider:true,speech:'controlled boundary adapter; physical speech validation remains open',record,errors,dimensions};
 assert.equal(errors.length,0,errors.join(';'));
 fs.writeFileSync(path.join(out,'browser-journey.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await browser.close();
}
main().catch(async e=>{console.error(e);if(activePage){await activePage.screenshot({path:path.join(out,'browser-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'browser-failure.txt'),await activePage.locator('body').innerText());}await activeBrowser?.close();process.exit(1)});
