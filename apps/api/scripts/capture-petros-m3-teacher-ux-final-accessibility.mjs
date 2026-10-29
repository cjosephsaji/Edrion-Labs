import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const out=resolve(root,'docs/verification/petros-v2/m3-teacher-ux-final-evidence/accessibility',new Date().toISOString().replaceAll(':','-'));mkdirSync(out,{recursive:true});
const info=JSON.parse(readFileSync(resolve(root,'docs/verification/petros-v2/m3-teacher-ux-final-evidence/demo-info.json'),'utf8'));
const browser=await chromium.launch({executablePath:'/Users/macbook/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
function record(name,passed,detail){checks.push({name,passed,detail});if(!passed)throw Error(name);}
try {
 await page.goto(info.cloud+'#petros-lessons-preview',{waitUntil:'networkidle',timeout:120000});
 await page.getByLabel('Source cards to classify').waitFor();
 const contrast=await page.evaluate(()=>{
  const selectors=['[aria-label="Petros Learn areas"] button[aria-current]','[aria-label="Lesson preparation steps"] button[aria-current]','[aria-label="Read-only activity preview"] h4','[aria-label="Source cards to classify"] li','[aria-label="Classification categories"] h5','[aria-label="Lesson status"]','footer button:last-child'];
  const rgb=c=>c.match(/[\d.]+/g)?.slice(0,3).map(Number);
  const lum=c=>c.map(n=>{const x=n/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
  return selectors.map(selector=>{
   const el=document.querySelector(selector);if(!el)return {selector,passed:false,missing:true};
   const style=getComputedStyle(el);let ancestor=el,background='rgb(255,255,255)';
   while(ancestor){const c=getComputedStyle(ancestor).backgroundColor;if(!['rgba(0, 0, 0, 0)','transparent'].includes(c)){background=c;break;}ancestor=ancestor.parentElement;}
   const a=lum(rgb(style.color)),b=lum(rgb(background));const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   const large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700);
   return {selector,foreground:style.color,background,ratio,passed:ratio>=(large?3:4.5)};
  });
 });
 for(const c of contrast)record('measured contrast '+c.selector,c.passed,c);
 writeFileSync(resolve(out,'contrast.json'),JSON.stringify(contrast,null,2));
 for(const width of [1440,1280,768,390,360]) {
  await page.setViewportSize({width,height:width<700?844:1000});
  await page.getByLabel('Read-only activity preview').evaluate(el=>{const main=el.closest('main');const nav=document.querySelector('[aria-label="Lesson preparation steps"]');main.scrollTop+=el.getBoundingClientRect().top-main.getBoundingClientRect().top-60-nav.getBoundingClientRect().height-12;});
  const sticky=await page.evaluate(()=>{
   const main=document.querySelector('main').getBoundingClientRect();const nav=document.querySelector('[aria-label="Lesson preparation steps"]').getBoundingClientRect();const footer=document.querySelector('[aria-label="Petros learning proposals"] footer').getBoundingClientRect();
   return {mainTop:main.top,topbarBottom:document.querySelector('main header').getBoundingClientRect().bottom,navTop:nav.top,footerBottom:footer.bottom,height:innerHeight,current:document.querySelector('[aria-current="step"]').textContent};
  });
  record(width+'px sticky steps identify current preview',Math.abs(sticky.topbarBottom-sticky.navTop)<=1 && sticky.current.includes('Preview activities'),sticky);
  record(width+'px footer remains in viewport',sticky.footerBottom<=sticky.height+1,sticky);
  await page.getByRole('button',{name:'Review lesson',exact:true}).click();
  const summary=page.getByLabel('More actions for objective 2');await summary.scrollIntoViewIfNeeded();await summary.focus();await page.keyboard.press('Enter');
  const move=page.getByRole('button',{name:'Move up',exact:true});
  const hit=await move.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:r.top,bottom:r.bottom,inside:hit===el||el.contains(hit)};});
  record(width+'px open objective menu is not covered',hit.inside,hit);
  await page.screenshot({path:resolve(out,`objective-menu-${width}px.png`)});
  await page.keyboard.press('Escape');record(width+'px menu Escape restores summary focus',await summary.evaluate(e=>e===document.activeElement));
  await page.getByRole('button',{name:'Preview activities',exact:true}).click();
  await page.getByLabel('Source cards to classify').waitFor();
  await page.getByRole('button',{name:'View source material',exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'View source material',exact:true}).focus();
  const scroll=await page.locator('main').evaluate(e=>e.scrollTop);
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');await dialog.locator('table').waitFor({state:'attached'});
  record(width+'px source dialog fits horizontally',await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));
  for(let i=0;i<15;i++)await page.keyboard.press('Tab');
  record(width+'px source keyboard stays inside dialog',await dialog.evaluate(e=>e.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');record(width+'px reverse tab stays inside dialog',await dialog.evaluate(e=>e.contains(document.activeElement)));
  await page.screenshot({path:resolve(out,`source-drawer-${width}px.png`)});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='View source material');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  record(width+'px source close restores focus and scroll',await page.getByRole('button',{name:'View source material',exact:true}).evaluate(e=>e===document.activeElement)&&Math.abs(await page.locator('main').evaluate(e=>e.scrollTop)-scroll)<2,{before:scroll,after:await page.locator('main').evaluate(e=>e.scrollTop)});
 }
 await page.route('**/proposals/*/evidence/*',async route=>{
  const response=await route.fetch();
  await new Promise(resolve=>setTimeout(resolve,500));
  await route.fulfill({response});
 });
 await page.getByRole('button',{name:'View source material',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='View source material');
 record('Escape during an actual delayed source read restores focus',await page.getByRole('dialog').count()===0);
 await page.waitForFunction(()=>document.querySelector('[aria-label="Petros learning proposals"]').getAttribute('aria-busy')==='false');
 record('completed source read does not reopen drawer or steal focus',await page.getByRole('dialog').count()===0 && await page.getByRole('button',{name:'View source material',exact:true}).evaluate(e=>e===document.activeElement));
 await page.unroute('**/proposals/*/evidence/*');
 for(const width of [1440,390,360]) {
  await page.setViewportSize({width,height:width<700?844:1000});
  await page.getByRole('button',{name:'Learning goals',exact:true}).click();
  await page.getByText('2 students on the class list · 2 permitted recipients for learning goals',{exact:true}).waitFor();
  record(width+'px count and assignment explanation are accurate',await page.getByText('Student assignment unavailable',{exact:true}).isVisible() && await page.getByText(/The enrolled students are permitted fixture recipients/).isVisible());
  await page.evaluate(()=>document.querySelector('main').scrollTop=0);
  await page.screenshot({path:resolve(out,`learning-goals-${width}px.png`)});
 }
 await page.getByRole('button',{name:'Lessons',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Save & submit',exact:true}).click();
 await page.getByRole('heading',{name:'Your lesson has been submitted for review',exact:true}).evaluate(el=>{
   const main=el.closest('main');const nav=document.querySelector('[aria-label="Lesson preparation steps"]');
   main.scrollTop+=el.getBoundingClientRect().top-main.getBoundingClientRect().top-60-nav.getBoundingClientRect().height-24;
 });
 await page.screenshot({path:resolve(out,'step-4-status-content-1440px.png')});
 record('submitted status and student availability remain distinct',await page.getByLabel('Lesson status').innerText().then(t=>t.includes('Submitted for review')) && await page.getByRole('heading',{name:'Student use unavailable',exact:true}).isVisible());
 writeFileSync(resolve(out,'aria-snapshot.yml'),await page.locator('section[aria-label="Petros learning proposals"]').ariaSnapshot());
 record('no browser runtime errors',errors.length===0,errors);
} catch(e){errors.push(e.message);await page.screenshot({path:resolve(out,'diagnostic.png')});process.exitCode=1;}
writeFileSync(resolve(out,'results.json'),JSON.stringify({checks,errors,limits:'Chromium keyboard/geometry/contrast/ARIA checks. No screen-reader-device or representative teacher study.'},null,2));
await browser.close();console.log(JSON.stringify({out,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,errors}));
