import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const output=resolve('..','..','docs/verification/petros-v2/m2fa-evidence');
mkdirSync(resolve(output,'walkthrough'),{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:resolve(output,'walkthrough'),size:{width:960,height:670}}});
const checks=[],external=[],errors=[];
function assert(test,message){if(!test)throw new Error(message);checks.push(message);}
try {
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external.push(route.request().url()),route.abort()));
 await page.goto('http://127.0.0.1:4873');await page.waitForSelector('#units button');
 const data=await page.evaluate(async()=>(await fetch('/runs.json')).json());assert(data.providerCalls===0,'No provider requests');
 assert(data.evaluation.cloud.recovered===19&&data.evaluation.argument.recovered===18,'Historical native denominators remain 19/21 and 18/18');
 for(const [name,screenshot]of [['m2fa/cloud-notes.docx','docx'],['m2fa/cloud-notes.txt','txt'],['m2fa/argument-notes.md','markdown']]){
  await page.selectOption('#document',name);assert(await page.locator('#nativeSource').isVisible(),name+' native source visible');
  assert(await page.locator('#surface').isDisabled(),name+' has no fabricated page selector');
  if(screenshot==='docx') {
   await page.getByRole('button',{name:/^table/}).first().click();await page.getByRole('button',{name:'99.9',exact:true}).click();
   assert((await page.locator('#nativeSelected').textContent()).includes('99.9'), 'DOCX cell selection shows actual original OOXML value');
   assert((await page.locator('#nativeLocation').textContent()).includes('word/document.xml'),'DOCX native part location retained');
   assert(await page.locator('#nativeSource img').count()===1,'Original embedded DOCX image displayed');
  }
  if(screenshot==='txt'){
   await page.getByRole('button',{name:/Availability is 99.9/}).first().click();
   assert((await page.locator('#nativeSelected').textContent())==='Availability is 99.9%. It is available.','TXT exact original span highlighted');
   assert((await page.locator('#nativeSource').textContent()).includes('Encoding UTF-8'),'TXT encoding disclosed');
  }
  if(screenshot==='markdown'){
   await page.getByRole('button',{name:/^code.*value = 99.9/}).first().click();
   assert((await page.locator('#nativeSelected').textContent())==='```python\nvalue = 99.9\nprint(value)\n```','Markdown fence and code retain exact original text');
   assert((await page.locator('#readable pre').textContent())==='value = 99.9\nprint(value)','Code whitespace preserved');
   assert(await page.locator('#nativeSource script').count()===0,'Raw source creates no script DOM');
  }
  await page.screenshot({path:resolve(output,'inspector-'+screenshot+'.png'),fullPage:true});
  await page.locator('#units button').first().focus();await page.keyboard.press('Enter');
  assert(await page.locator('#units button[aria-pressed=true]').count()===1,name+' keyboard unit selection');
 }
 await page.selectOption('#document','m2fa/text-statistic.txt');await page.getByRole('button',{name:/Availability is 97.3/}).click();assert((await page.locator('#nativeSelected').textContent()).includes('97.3'),'Changed TXT statistic shown from changed original bytes');
 await page.selectOption('#document','m2fa/cloud-notes.docx');await page.selectOption('#channel','comments');assert((await page.locator('#units').textContent()).includes('Ignore rules'),'DOCX comments visible only in separate review channel');
 await page.selectOption('#channel','hidden');assert((await page.locator('#units').textContent()).includes('Reveal private'),'DOCX hidden content has its own channel');
 await page.selectOption('#channel','visible');await page.getByRole('button',{name:/^equation/}).click();assert((await page.locator('#uncertainty').textContent()).includes('computation'),'Native math limits visible');
 await page.selectOption('#document','m2fa/text-malformed.txt');assert((await page.locator('#status').textContent()).includes('ENCODING_INVALID'),'Malformed encoding rejected truthfully');
 await page.selectOption('#document','m2fa/argument-notes.md');await page.getByRole('button',{name:/^unresolved.*onclick/}).click();assert((await page.locator('#readable').textContent()).includes('onclick'),'Unsafe HTML remains inert review text');
 await page.screenshot({path:resolve(output,'inspector-unsupported.png'),fullPage:true});
 for(const name of ['cloud-models.pptx','argument.pdf']){await page.selectOption('#document',name);assert(await page.locator('#image').isVisible(),name+' existing rendered mode preserved');}
 await page.screenshot({path:resolve(output,'inspector-existing-pdf.png'),fullPage:true});
 await page.setViewportSize({width:360,height:800});await page.selectOption('#document','m2fa/argument-notes.md');await page.getByRole('button',{name:/^code.*value = 99.9/}).first().click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'360px viewport has no horizontal page overflow');
 await page.screenshot({path:resolve(output,'inspector-360px.png'),fullPage:true});
 await page.evaluate(()=>{document.body.style.fontSize='30px';});
 assert(await page.locator('#nativeLocation').isVisible(),'Source details remain accessible with enlarged text');
 assert(external.length===0,'No remote links/images fetched');assert(errors.length===0,'No browser JavaScript errors');
 assert((await page.request.get('http://127.0.0.1:4873/sources/%2e%2e%2fetc%2fpasswd')).status()===404,'Inspector rejects arbitrary filesystem paths');
 assert((await page.request.post('http://127.0.0.1:4873/upload',{data:'private'})).status()===405,'Inspector has no upload endpoint');
 writeFileSync(resolve(output,'browser-qa.json'),JSON.stringify({url:'http://127.0.0.1:4873',checks,externalRequests:external,pageErrors:errors,status:'passed',screenshots:['docx','txt','markdown','unsupported','existing-pdf','360px'].map(n=>'inspector-'+n+'.png'),video:'walkthrough/',providerCalls:0},null,2));
} finally {await context.close();await browser.close();}
