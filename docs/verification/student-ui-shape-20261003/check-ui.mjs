import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire('/Volumes/Chris/Edrion Labs/apps/api/package.json')('playwright-core');
const meta=JSON.parse(fs.readFileSync('/tmp/petros-phase6-browser.json'));
assert.equal(meta.cohortKind,'disposable-synthetic');
const out='/Volumes/Chris/Edrion Labs/docs/verification/student-ui-shape-20261003';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const prior=process.env.UI_DIALOG_ONLY==='1'?JSON.parse(fs.readFileSync(outPath()+'/routes-report.json')):null;
function outPath(){return '/Volumes/Chris/Edrion Labs/docs/verification/student-ui-shape-20261003';}
const records=prior?.records||[],errors=prior?.errors||[];
const routes=['home','learn','petros','materials','petros/artifacts','notes','flashcards','progress','learning-path','courses','assignments','homework','timetable','calendar','classes','exams','results','attendance','report-cards','profile','settings','notifications','fees','requests','transport','hostel','announcements','documents','design-system'];
routes.push(`courses/${meta.courseId}`, `classes/${meta.classId}`);
const primary=new Set(['home','learn','petros','materials','petros/artifacts','settings','progress','design-system']);
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:meta.cookieName,value:meta.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 async function visit(route){console.log('Inspecting '+route);await page.goto(meta.web+route,{waitUntil:'domcontentloaded'});await page.locator('main').waitFor();await page.waitForFunction(()=>document.querySelector('main h1, main h2, main [role="status"]'),{}, {timeout:15000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1000);}
 page.on('pageerror',error=>errors.push({route:new URL(page.url()).pathname,message:error.message}));
 async function inspect(size,route){
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,{}, {timeout:5000}).catch(()=>{});
  const record=await page.evaluate(()=>{
   const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
   const surfaces=[...document.querySelectorAll('main *')].filter(el=>{
    if(!visible(el))return false;const c=getComputedStyle(el),r=el.getBoundingClientRect();
    return r.width>=60&&r.height>=28&&['Top','Right','Bottom','Left'].every(side=>parseFloat(c['border'+side+'Width'])>0)&&c.borderTopStyle!=='none';
   }).map(el=>({tag:el.tagName,label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,70),class:el.className,radius:getComputedStyle(el).borderTopLeftRadius}));
   return {viewport:innerWidth,width:document.documentElement.scrollWidth,heading:document.querySelector('main h1')?.textContent||null,stateMessages:[...document.querySelectorAll('main [role="status"]')].map(el=>el.textContent.trim().slice(0,160)),surfaces};
  });records.push({size,route,...record});
  if(primary.has(route)||route==='petros/session'){
   await page.screenshot({path:`${out}/${size}-${route.replaceAll('/','-')}.png`,fullPage:true});
   await page.screenshot({path:`${out}/${size}-${route.replaceAll('/','-')}-viewport.png`});
  }
 }
 for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);
  for(const route of (prior?[]:routes)){await visit('/'+route);assert(!page.url().includes('/login'),route+' unexpectedly requires login');await inspect(size,route);}
 }
 fs.writeFileSync(out+'/routes-report.json',JSON.stringify({date:new Date().toISOString(),records,errors},null,2));
 // Inspect source preview, navigation and document dialogs, then open a fresh
 // deterministic synthetic lesson instead of reusing the expired earlier review.
 await page.setViewportSize({width:1440,height:1000});
 await visit('/materials');
 await page.getByRole('button',{name:'View '+meta.materialTitle+' in Edrion',exact:true}).first().click();
 await page.getByRole('dialog').waitFor();
 for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await inspect(size,'document-dialog');await page.screenshot({path:`${out}/${size}-document-dialog.png`});
 }
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:1440,height:1000});
 await visit('/petros');
 await page.getByRole('button',{name:'Plan a lesson from '+meta.materialTitle,exact:true}).click();
 await page.getByRole('dialog').waitFor();
 for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await inspect(size,'lesson-preview-dialog');await page.screenshot({path:`${out}/${size}-lesson-preview-dialog.png`});
 }
 const start=page.getByRole('button',{name:/Start (planned lesson|this session)/});await start.click();
 await page.waitForURL('**/petros/session?session=*');await page.locator('main h1').waitFor();
 await page.setViewportSize({width:1440,height:1000});
 const quick=page.getByRole('button',{name:'Keep it to the essentials',exact:true});if(await quick.count())await quick.click();
 const scene=page.getByRole('region',{name:'Petros program workspace'}).first();
 if(await scene.count()){const startScene=scene.getByRole('button',{name:'Start scene',exact:true});if(await startScene.count())await startScene.click();}
 for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){await page.setViewportSize(viewport);await inspect(size,'petros/session');}
 await visit('/home');
 for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(viewport);await page.getByRole('button',{name:'Explore',exact:true}).click();
  await page.getByRole('dialog').waitFor();await inspect(size,'navigation-dialog');await page.screenshot({path:`${out}/${size}-navigation-dialog.png`});await page.keyboard.press('Escape');
 }
 await context.close();
 const failures=records.filter(r=>r.width>r.viewport+1);
 fs.writeFileSync(out+'/browser-report.json',JSON.stringify({date:new Date().toISOString(),fixture:'disposable synthetic',browser:'installed Chrome',records,errors,overflowFailures:failures.map(({route,size,width,viewport})=>({route,size,width,viewport}))},null,2));
 console.log(JSON.stringify({pages:records.length,pageErrors:errors.length,overflowFailures:failures.map(r=>`${r.size}:${r.route}`),squareSurfaces:records.filter(r=>primary.has(r.route)).flatMap(r=>r.surfaces.filter(s=>s.radius==='0px').map(s=>({route:r.route,size:r.size,...s})))}));
 assert.equal(errors.length,0,'Browser page errors');assert.equal(failures.length,0,'Page overflow');
} finally {await browser.close();}
