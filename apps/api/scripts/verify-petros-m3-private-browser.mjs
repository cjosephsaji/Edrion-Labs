// Explicit isolated synthetic current-owner/reviewer demonstration. Run AFTER the ordinary two-subject browser.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out=resolve(import.meta.dirname,'../../../docs/verification/petros-v2/m3-evidence');
const response=await fetch('http://127.0.0.1:4893/demo/private-review',{method:'POST'});
if(!response.ok)throw Error(`Synthetic reviewer fixture failed: ${await response.text()}`);
const info=await response.json();
const browser=await chromium.launch({executablePath:'/Users/macbook/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const url=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(url.hostname))await route.continue();else await route.abort();});
const record=(name,passed)=>{checks.push({name,passed});if(!passed)throw Error(name);};
try {
 await page.goto(info.url,{waitUntil:'domcontentloaded',timeout:120000});await page.getByRole('tab',{name:'Petros Learn',exact:true}).click({timeout:120000});
 await page.getByLabel('Source document').selectOption({label:'m3/private-review-source.txt · txt'});await page.getByRole('button',{name:'Open saved proposal',exact:true}).click();
 await page.getByText(/Engineering-generated source outline/).waitFor();record('actual TXT source and honest engineering provenance',await page.getByText(/Engineering-generated source outline/).isVisible());
 await page.getByText('Qualified reviewer decisions',{exact:true}).click();await page.getByLabel('Review reason').fill('Isolated synthetic independent review; no real academic acceptance.');
 record('server-derived current synthetic qualification',!(await page.getByLabel('Current reviewer qualification').isDisabled()));
 await page.getByRole('button',{name:'Request verification review',exact:true}).click();record('qualified request opens and focuses the family selector',await page.getByLabel('Candidate family').evaluate(e=>e===document.activeElement));
 const options=await page.getByLabel('Candidate family').locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent})));
 await page.getByLabel('Candidate family').selectOption(options.find(o=>o.text.includes('held out verification')&&o.text.includes('qualified review required')).value);
 await page.getByRole('button',{name:'Inspect private review draft',exact:true}).click();await page.getByRole('region',{name:'Qualified private review'}).waitFor();
 await page.getByText('Private reference criteria',{exact:true}).click();record('qualified private panels remain separate from shared public preview',await page.getByRole('region',{name:'Qualified private review'}).isVisible()&&await page.getByText(/Structural preview · Adaptive/).count()===0);
 record('independent equivalence decision required',await page.getByRole('button',{name:'Approve this instrument',exact:true}).isDisabled());
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Approve this instrument',exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('#verification-family option')).some(o=>o.textContent.includes('held out verification')&&o.textContent.includes('approved')));
 record('durable exact-family approval leaves overall verification pending',await page.getByText('Practice available; verification pending.',{exact:true}).isVisible());
 await page.screenshot({path:resolve(out,'private-qualified-review.png'),fullPage:true});
 for(const name of ['teaching scope','concepts','activities']){await page.getByRole('button',{name:`Approve ${name}`,exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Approve teaching scope')&&b.disabled));}
 await page.getByRole('button',{name:'Check and record isolated release',exact:true}).click();await page.getByText(/Isolated authorization-path receipt recorded/).waitFor();record('synthetic scope manifest creates no student publication',await page.getByText(/Students have not received this content/).isVisible());
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('tab',{name:'Petros Learn',exact:true}).click();
 await page.getByLabel('Source document').selectOption({label:'m3/private-review-source.txt · txt'});await page.getByRole('button',{name:'Open saved proposal',exact:true}).click();
 await page.getByText(/A durable isolated scope manifest is recorded/).waitFor();record('recorded manifest survives a real browser refresh',await page.getByText(/A durable isolated scope manifest is recorded/).isVisible());
 await page.screenshot({path:resolve(out,'private-isolated-manifest.png'),fullPage:true});
 await page.getByText('Private verification candidates · qualified reviewers only',{exact:true}).click();
 await page.getByLabel('Candidate family').selectOption(options.find(o=>o.text.includes('held out verification')&&o.text.includes('qualified review required')).value);
 await page.getByRole('button',{name:'Inspect private review draft',exact:true}).click();await page.getByRole('region',{name:'Qualified private review'}).waitFor();
 await page.getByRole('button',{name:'Edit candidate wording',exact:true}).click();await page.getByLabel('Private candidate wording').fill('State defensible observable work and a bounded alternative interpretation of the reserved evidence.');
 await page.getByRole('button',{name:'Save private candidate revision',exact:true}).click();await page.getByText(/Family version 2/).waitFor();
 record('private correction invalidates the approval',await page.getByRole('button',{name:'Approve this instrument',exact:true}).isDisabled());
 const publicPath=`http://127.0.0.1:4893/v1${new URL(info.url).pathname.replace('/teaching/','/portal/teaching/')}/proposals`;
 const sourceList=await (await page.request.get(`${publicPath}/sources`)).json();
 const proposalId=sourceList.items.find(s=>s.title==='m3/private-review-source.txt').proposalId;
 const ordinary=JSON.stringify(await (await page.request.get(`${publicPath}/${proposalId}`)).json());
 record('no private body in ordinary proposal response',!ordinary.includes('privateEvaluationPrompt')&&!ordinary.includes('Candidate instructions only. Do not execute an evaluator'));
 record('no runtime errors',errors.length===0);
 writeFileSync(resolve(out,'private-browser-checks.json'),JSON.stringify({label:info.label,checks,errors,passed:checks.length,privateAssessmentExecution:false},null,2));
 console.log(JSON.stringify({passed:checks.length,errors}));
} catch(error) {
 await page.screenshot({path:resolve(out,'private-browser-failure.png'),fullPage:true});writeFileSync(resolve(out,'private-browser-failure.json'),JSON.stringify({checks,errors,error:String(error)},null,2));throw error;
} finally {await browser.close();}
