import {chromium} from 'playwright-core';import {browserExecutable} from './browser-executable';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true});
try{
 const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
 await page.route('**/prototype/api/speech',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Intentional failure test'})}));
 await page.route('**/prototype/api/teacher',r=>r.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:'Intentional quota failure test'})}));
 await page.goto('http://127.0.0.1:3022/prototype');await page.locator('#petros-observations').waitFor({state:'attached'});
 await page.getByRole('button',{name:'Start with voice →',exact:true}).click();await page.waitForTimeout(1500);
 const state=()=>page.locator('#petros-observations').textContent().then(s=>JSON.parse(s!));assert.equal((await state()).guide.phase,'ORIENT');
 await page.getByRole('button',{name:'Continue with Petros →',exact:true}).click();assert.equal((await state()).guide.phase,'EXPLAIN');
 const before=await state();await page.getByLabel('Ask Petros',{exact:true}).fill('What if the input were negative?');await page.getByRole('button',{name:'Send question',exact:true}).click();await page.getByText('Intentional quota failure test',{exact:true}).waitFor();assert.deepEqual((await state()).sim,before.sim);assert.ok((await state()).activeQuestion.includes('negative'));
 await page.getByRole('button',{name:/Traffic waves/}).click();await page.getByRole('button',{name:'Start learning with captions',exact:true}).click();await page.getByRole('button',{name:'Explore freely',exact:true}).click();
 await page.getByText('Experiment controls & live measurements',{exact:false}).click();const pause=page.getByRole('button',{name:'Ⅱ Pause',exact:true});if(await pause.isVisible())await pause.click();await page.getByRole('button',{name:/Run experiment/}).click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#petros-observations')!.textContent!).sim.running);
 await page.getByLabel('Following time · s',{exact:true}).focus();await page.getByLabel('Following time · s',{exact:true}).press('Home');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#petros-observations')!.textContent!).params.headway===.5);
 assert.equal((await state()).sim.running,false);assert.equal((await state()).guide.phase,'EXPLORE');const stopped=(await state()).sim.time;await page.waitForTimeout(500);assert.equal((await state()).sim.time,stopped);
 await writeFile(new URL('../evidence/corrective/failure-recovery.json',import.meta.url),JSON.stringify({scope:'Explicitly mocked failures only. No claim of successful provider audio or AI.',voiceFailurePauses:true,textContinuation:true,quotaFailurePreservesModelAndQuestion:true,trafficControlWhileRunning:true,noStaleWorkerOverwrite:true},null,2));console.log('PASS failure fallback and running control cancellation');
 await context.close();
}finally{await browser.close();}
