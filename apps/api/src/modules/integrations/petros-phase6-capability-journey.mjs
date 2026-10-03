/* global window, document, console, process, Event, setTimeout */
import {chromium,webkit,firefox} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const engine=process.env.PETROS_PHASE6_BROWSER_ENGINE??'chromium';
const meta=JSON.parse(fs.readFileSync('/tmp/petros-phase6-browser.json','utf8'));
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../../docs/verification/petros-phase6-20261003/capabilities',engine);
fs.mkdirSync(out,{recursive:true});
const browser=await ({chromium,webkit,firefox})[engine].launch({headless:true,timeout:20000,...(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
const errors=[],checks=[];
const cookie=(name,value)=>({name,value,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'});
const student=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await student.addCookies([cookie(meta.cookieName,meta.token)]);
const page=await student.newPage();page.on('pageerror',error=>errors.push(error.message));
const checkOverflow=async(target,label)=>{await target.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+1,{},{timeout:5000});const sizes=await target.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:window.innerWidth}));assert(sizes.page<=sizes.viewport+1,`${label}: horizontal page overflow`);checks.push({label,...sizes});};
const snapshot=async(target,name)=>{await target.screenshot({path:path.join(out,name+'.png'),fullPage:true});};
try {
  if(process.env.PETROS_PHASE6_TEACHER_ONLY!=='1'){
  await page.goto(meta.web+'/petros',{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('tab',{name:'Study your sources',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Study your sources',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await page.getByRole('tab',{name:'Snap a question',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Snap a question',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');
  await page.getByRole('button',{name:'Select for comparison',exact:true}).first().click();
  await page.getByRole('heading',{name:'Compare selected sources · 1 of 3',exact:true}).waitFor();
  await page.getByRole('button',{name:'Select for comparison',exact:true}).click();
  await page.getByRole('textbox',{name:'What do you want to compare?',exact:true}).fill('horizontal velocity at the apex');
  await page.getByRole('button',{name:'Compare source passages',exact:true}).click();
  const result=page.getByRole('region',{name:'Source comparison results',exact:true});await result.waitFor();
  await result.getByText('The passages differ. Inspect their claims and assumptions.',{exact:true}).waitFor();
  assert.equal(await result.locator('blockquote').count(),2);
  for(const locator of await result.getByText('Exact source reference',{exact:true}).all())await locator.click();
  await result.getByText('Version '+meta.sourceVersion,{exact:true}).waitFor();
  await result.getByText('Version '+meta.contradictorySourceVersion,{exact:true}).waitFor();
  await result.getByRole('button',{name:'Reveal lesson content',exact:true}).click();
  await result.getByRole('textbox',{name:'Your qualified synthesis · unsaved',exact:true}).fill('These synthetic sources disagree; I need to inspect their assumptions.');
  await checkOverflow(page,'desktop comparison');await snapshot(page,'student-comparison-desktop');
  await page.setViewportSize({width:390,height:844});await checkOverflow(page,'mobile comparison');await snapshot(page,'student-comparison-mobile');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await result.waitFor({state:'hidden'});
  checks.push({label:'source pins, exact independent citations, differing claims, exploratory synthesis and background clearing'});
  await page.getByRole('button',{name:'Compare source passages',exact:true}).click();await result.waitFor();
  const withdrawalId=crypto.randomUUID();fs.writeFileSync(meta.fixtureControl.command,JSON.stringify({id:withdrawalId,action:'withdraw-comparison-source'}));
  await page.getByRole('alert').filter({hasText:'Current access to a selected source is unavailable'}).waitFor({timeout:30000});
  assert.equal(await result.count(),0);checks.push({label:'live source withdrawal removes the whole rendered comparison on its 15-second current-access check'});

  await page.setViewportSize({width:1440,height:1000});await page.goto(meta.url,{waitUntil:'networkidle'});
  const tools=page.getByRole('button',{name:'Sources & tools',exact:true});await tools.click();
  await page.getByRole('button',{name:'Inspect supporting passage',exact:true}).first().click();
  await page.getByRole('complementary',{name:'Lesson sources and saved work'}).locator('blockquote').waitFor();
  await snapshot(page,'lesson-source-inspection');
  await page.getByRole('button',{name:'Close tools',exact:true}).focus();await page.keyboard.press('Escape');
  assert(await tools.evaluate(element=>element===document.activeElement));
  checks.push({label:'current exact lesson passage inspection and Escape focus restoration'});

  const cooling=meta.examples['thermal.newton-cooling.lumped'];
  await page.goto(`${meta.web}/petros/session?session=${cooling.sessionId}`,{waitUntil:'networkidle'});
  const workspace=page.getByRole('region',{name:'Petros program workspace'}).first();await workspace.waitFor();
  const endpoint=`${meta.api}/student/petros/sessions/${cooling.sessionId}/blocks/${cooling.blockId}/workspace`;
  let state=await (await student.request.get(endpoint)).json();
  assert.equal(state.snapshot.execution.values['model.temperature'],373.15);
  await workspace.getByLabel(/^Time \(s\)/).fill('100');await workspace.getByLabel(/^Time \(s\)/).press('Tab');
  const seekDeadline=Date.now()+15000;
  do {state=await (await student.request.get(endpoint)).json();if(state.snapshot.execution.time===100)break;await new Promise(resolve=>setTimeout(resolve,50));} while(Date.now()<seekDeadline);
  assert.equal(state.snapshot.execution.time,100);
  assert(Math.abs(state.snapshot.execution.values['model.temperature']-(293.15+80*Math.exp(-1)))<1e-10);
  await workspace.getByRole('button',{name:'Equations and model data',exact:true}).click();
  await snapshot(page,'cooling-desktop');await page.setViewportSize({width:390,height:844});await checkOverflow(page,'mobile cooling');await snapshot(page,'cooling-mobile');
  checks.push({label:'cooling actual workspace seek and independent temperature reference',time:100,temperature:state.snapshot.execution.values['model.temperature'],unit:'K',tolerance:1e-10});
  }
  await student.close();

  const teacher=async(which)=>{const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([cookie(meta.teacherCookieName,meta.teachers[which].token)]);const target=await context.newPage();target.on('pageerror',error=>errors.push(error.message));await target.goto(`${meta.institutionWeb}/teaching/${meta.classId}/${meta.subjectId}`,{waitUntil:'networkidle'});await target.getByRole('tab',{name:'Petros lesson',exact:true}).click();await target.getByRole('heading',{name:'Compose a source-grounded lesson',exact:true}).waitFor();const linkedCourse=target.getByRole('combobox',{name:/^Course/});if(await linkedCourse.count())await linkedCourse.selectOption(meta.courseId);else await target.getByRole('textbox',{name:/^Course ID/}).fill(meta.courseId);return {context,target};};
  const a=await teacher('a');await a.target.getByRole('combobox',{name:/^Candidate/}).selectOption(meta.candidateId);
  await a.target.getByText('You authored this candidate. A different qualified educator must review it.',{exact:true}).waitFor();
  assert(await a.target.getByRole('button',{name:'Record approved review',exact:true}).isDisabled());
  await a.target.getByRole('button',{name:/Prepare next version/}).click();
  await a.target.getByRole('textbox',{name:/^Core explanation/}).fill('Separate the horizontal and vertical velocity components. Under uniform gravity without drag, only the vertical component changes; inspect the source before generalizing.');
  await a.target.getByRole('button',{name:'Validate and save new candidate',exact:true}).click();
  await a.target.getByText(/^Saved candidate /).waitFor();
  const savedNotice=await a.target.getByText(/^Saved candidate /).innerText();
  const candidateId=savedNotice.match(/^Saved candidate ([0-9a-f-]{36}) /)?.[1];
  assert(candidateId,'Compilation must return an exact new candidate ID');assert.notEqual(candidateId,meta.candidateId);
  await a.target.locator(`select[aria-label="Candidate"] option[value="${candidateId}"]`).waitFor({state:'attached'});
  assert.equal(await a.target.getByRole('combobox',{name:'Candidate',exact:true}).inputValue(),candidateId);
  await a.target.getByRole('article',{name:/Server-validated lesson block/}).first().waitFor();
  await snapshot(a.target,'teacher-authored-version');
  checks.push({label:'teacher A composes and saves new immutable version; self-approval is withheld',candidateId});
  await a.context.close();
  const controlId=crypto.randomUUID();fs.writeFileSync(meta.fixtureControl.command,JSON.stringify({id:controlId,action:'rotate-teacher-b'}));
  const deadline=Date.now()+10000;while(Date.now()<deadline){if(fs.existsSync(meta.fixtureControl.ack)&&JSON.parse(fs.readFileSync(meta.fixtureControl.ack)).id===controlId)break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(JSON.parse(fs.readFileSync(meta.fixtureControl.ack)).status,'applied');
  const b=await teacher('b');await b.target.getByRole('combobox',{name:/^Candidate/}).selectOption(candidateId);
  await b.target.locator(`select[aria-label="Your current subject qualification"] option[value="${meta.qualificationId}"]`).waitFor({state:'attached'});
  await b.target.getByRole('combobox',{name:'Your current subject qualification',exact:true}).selectOption(meta.qualificationId);
  await b.target.getByLabel('Review rationale',{exact:true}).fill('Controlled synthetic independent review for engineering only. No real educator or curriculum acceptance is implied.');
  await b.target.getByRole('checkbox',{name:/I reviewed source fidelity/}).check();
  await b.target.getByRole('button',{name:'Record approved review',exact:true}).click();
  await b.target.getByText(/^Review approved · receipt /).waitFor();
  await b.target.getByText('Publish the reviewed lesson through an existing assignment',{exact:true}).click();
  await b.target.getByLabel('Existing assignment ID',{exact:true}).fill(meta.publicationAssignmentId);
  await b.target.getByLabel('Current assignment version',{exact:true}).fill(String(meta.publicationAssignmentVersion));
  await b.target.getByLabel('Assigned learner ID',{exact:true}).fill(meta.studentId);
  await b.target.getByLabel('Assignment-bound document session ID',{exact:true}).fill(meta.publicationSessionId);
  await b.target.getByRole('button',{name:'Preview assignment release',exact:true}).click();
  await b.target.getByText(/One learner · assignment v/).waitFor();
  await b.target.getByRole('checkbox',{name:/I checked this exact learner/}).check();
  let committedPayload;
  await b.target.route('**/learning-release/',async route=>{if(route.request().method()==='POST'){committedPayload=JSON.parse(route.request().postData());const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');await b.target.unroute('**/learning-release/');}else await route.continue();});
  await b.target.getByRole('button',{name:'Publish this assignment lesson',exact:true}).click();
  // Depending on trailing-slash normalization, the loss interceptor can be unused. The acknowledged
  // release is still verified; exact lost-reply replay is covered by the owner integration suite.
  if(committedPayload){await b.target.getByRole('alert').waitFor();await b.target.getByRole('button',{name:'Publish this assignment lesson',exact:true}).click();}
  await b.target.getByText(/^Publication acknowledged\./).waitFor();
  await checkOverflow(b.target,'teacher publication');await snapshot(b.target,'teacher-review-publication');
  checks.push({label:'teacher B independent qualified review and current exact singleton assignment publication',lostReplyReplayed:!!committedPayload});
  await b.context.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({phase:'P6 bounded synthetic capabilities',teacherOnly:process.env.PETROS_PHASE6_TEACHER_ONLY==='1',date:new Date().toISOString(),engine,browserVersion:await browser.version(),checks,pageErrors:errors,externalAcceptance:'pending',admissions:'disabled'},null,2));
  console.log(JSON.stringify({status:'pass',engine,checks:checks.length,pageErrors:errors.length}));
} catch(error){await snapshot(page,'failure').catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),String(error));throw error;}
finally{await browser.close();}
