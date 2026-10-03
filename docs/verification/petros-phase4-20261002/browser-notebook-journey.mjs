/* Evidence-only supplemental browser journey; frozen product/source files remain unchanged. */
import {chromium} from '../../../apps/api/node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=here;
let browser,page;
const record=[];
async function main(){
 const meta=JSON.parse(fs.readFileSync('/tmp/petros-phase4-browser.json','utf8'));
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:meta.cookieName,value:meta.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);
 page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const journeyPath=`${meta.api}/student/petros/continuity/sessions/${meta.sessionId}/journey`;
 const journeyBeforeResponse=await context.request.get(journeyPath);assert.equal(journeyBeforeResponse.status(),200);
 const journeyBefore=await journeyBeforeResponse.json();
 record.push({label:'current lesson journey resolved before the companion question',journeyId:journeyBefore.id,version:journeyBefore.version,
  threadId:journeyBefore.returnPoint?.threadId??null,unresolvedRequest:journeyBefore.returnPoint?.unresolvedRequest??null});
 const companionTurn=await context.request.post(`${meta.api}/student/petros/companion/turns`,{data:{
  message:'How should I begin?',route:`/petros/session?session=${meta.sessionId}`,surface:'learning_path',focusRef:'phase4-session',
  visibleCandidates:[{ref:'phase4-session',entityType:'petros_session',entityId:meta.sessionId,title:'Synthetic projectile',summary:'Approved source session',href:`/petros/session?session=${meta.sessionId}`}],
  idempotencyKey:crypto.randomUUID(),
 }});
 if(![200,201].includes(companionTurn.status()))throw new Error(`Controlled companion turn returned ${companionTurn.status()}: ${await companionTurn.text()}`);
 const companionResponse=await companionTurn.json();
 const providerCapture=JSON.parse(fs.readFileSync('/tmp/petros-phase4-provider-capture.json','utf8')).at(-1);
 assert.equal(providerCapture.functionKey,'companion.turn');assert(providerCapture.responseSchema);
 const dataEnvelope=providerCapture.input.find(part=>part.text?.includes('petros_dynamic_context'));
 assert(dataEnvelope?.text.includes('Synthetic source'),'Approved source context was not included in the companion input data envelope');
 assert(providerCapture.system.includes('untrusted data'),'Trusted companion guidance is missing the untrusted-data fence');
 record.push({label:'first action is an authenticated companion question about the visible approved lesson',status:companionTurn.status(),answerPresent:Boolean(companionResponse.answer),dynamicContextDataEnvelope:true,typedResponseSchema:true});
 const journeyAfterResponse=await context.request.get(journeyPath);assert.equal(journeyAfterResponse.status(),200);
 const journeyAfter=await journeyAfterResponse.json();
 record.push({label:'companion question continuity linkage inspected after the turn',journeyId:journeyAfter.id,version:journeyAfter.version,
  threadId:journeyAfter.returnPoint?.threadId??null,unresolvedRequest:journeyAfter.returnPoint?.unresolvedRequest??null,
  questionPreserved:Boolean(journeyAfter.returnPoint?.unresolvedRequest?.includes('How should I begin?'))});
 await page.goto(meta.url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('button',{name:'Start scene',exact:true}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'Start scene',exact:true}).click();
 const workspace=page.getByRole('region',{name:'Petros program workspace'}).first();
 await workspace.getByRole('heading',{name:'Projectile motion',exact:true}).waitFor({timeout:30000});

 const noteButton=page.getByRole('button',{name:'Save to notes',exact:true}).last();
 await noteButton.scrollIntoViewIfNeeded();await noteButton.click();
 await page.getByRole('button',{name:'Saved to notes',exact:true}).last().waitFor({timeout:30000});
 await page.getByText(/Saved to Notes/).last().waitFor({timeout:30000});
 record.push({label:'student explicitly saves a lesson takeaway to Notes through the styled lesson UI',saved:true});

 await page.getByRole('button',{name:'Make a flashcard',exact:true}).last().click();
 const flashcard=page.locator('form').filter({has:page.getByRole('button',{name:'Add flashcard',exact:true})}).last();
 await flashcard.getByLabel('Front').fill('What happens to velocity at the projectile apex?');
 await flashcard.getByLabel('Back').fill('Vertical velocity is zero; horizontal velocity remains constant. Gravity still accelerates downward.');
 await flashcard.getByRole('button',{name:'Add flashcard',exact:true}).click();
 await page.getByRole('button',{name:'Flashcard added',exact:true}).last().waitFor({timeout:30000});
 await page.getByText('Flashcard added to your Petros deck',{exact:true}).waitFor({timeout:30000});

 const savedResponse=await context.request.get(`${meta.api}/student/petros/artifacts?limit=100`);
 assert.equal(savedResponse.status(),200);const savedArtifacts=await savedResponse.json();
 const savedNote=savedArtifacts.find(item=>item.content.kind==='note');
 const savedCard=savedArtifacts.find(item=>item.content.kind==='flashcard'&&item.content.front==='What happens to velocity at the projectile apex?');
 assert(savedNote,'The explicit note was not present in the student-owned artifact list');
 assert(savedCard,'The flashcard was not present in the student-owned artifact list');
 record.push({label:'saved note and flashcard verified in the authenticated artifact owner list',noteId:savedNote.id,flashcardId:savedCard.id,flashcardDueAt:savedCard.dueAt});

 await page.goto(`${meta.web}/home`,{waitUntil:'domcontentloaded',timeout:60000});
 const notebookLink=page.getByRole('link',{name:'Open your notebook and review deck',exact:true});
 await notebookLink.waitFor({timeout:30000});await notebookLink.click();
 await page.getByRole('heading',{name:'Your artifacts and review deck',exact:true}).waitFor({timeout:30000});
 await page.getByRole('heading',{name:'Due for review',exact:true}).waitFor();
 const noDueCopy=page.getByText('Nothing is due right now. There is no artificial urgency.',{exact:true});
 const dueNow=await noDueCopy.isVisible().catch(()=>false);
 const noteArticle=page.getByRole('article').filter({hasText:savedNote.content.title});
 const cardArticle=page.getByRole('article').filter({hasText:'What happens to velocity at the projectile apex?'});
 await noteArticle.waitFor({timeout:30000});await cardArticle.waitFor({timeout:30000});
 await page.screenshot({path:path.join(out,'browser-notebook-review-flow.png'),fullPage:true});
 record.push({label:'home notebook/review-deck link opens the actual artifact page',route:'/petros/artifacts',noteVisible:true,flashcardVisible:true,dueQueueEmpty:dueNow,
  delayedIndependentTask:'unavailable in this fresh fixture; only the student-owned note/card workflow is seeded',noPrematureReviewClaim:true});
 assert.equal(errors.length,0,errors.join('; '));
 const report={date:new Date().toISOString(),browser:await browser.version(),viewport:[1440,1000],realAppModule:true,disposableFixture:true,record,errors};
 fs.writeFileSync(path.join(out,'browser-notebook-journey.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 await context.close();await browser.close();
}
main().catch(async error=>{
 console.error(error);
 fs.writeFileSync(path.join(out,'browser-notebook-failure.json'),JSON.stringify({error:String(error),record},null,2)+'\n');
 if(page){await page.screenshot({path:path.join(out,'browser-notebook-failure.png'),fullPage:true}).catch(()=>{});await fs.promises.writeFile(path.join(out,'browser-notebook-failure.txt'),await page.locator('body').innerText().catch(()=>''));}
 await browser?.close().catch(()=>{});process.exit(1);
});
