import {chromium} from 'playwright-core';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const browser=await chromium.launch({executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});
const results={checks:[],errors:[]};page.on('pageerror',e=>results.errors.push(e.message));
function check(value,name){if(!value)throw Error(name);results.checks.push(name);}
let release;const gate=new Promise(r=>release=r);let held=0;
try{
 await page.route('**/prototype/api/asset/classroom-shell.glb*',async route=>{held++;await gate;await route.continue();});
 await page.goto('http://127.0.0.1:3021/prototype');
 await page.getByRole('button',{name:'Learn AI_Module_3.pdf',exact:true}).click();
 await page.getByRole('button',{name:'Enter Petros World',exact:true}).click();
 const portal=page.getByRole('dialog',{name:'Entering Petros World'});
 await portal.getByRole('progressbar').waitFor();await page.waitForTimeout(1800);
 check(held===1,'Actual architectural GLB request held');
 check(await portal.getAttribute('data-phase')==='loading','Portal waits for imported architecture before teleporting');
 await page.screenshot({path:'evidence/realism/loading.png'});
 release();await portal.waitFor({state:'detached',timeout:30000});
 check(await page.locator('[data-world-scene] canvas').count()===1,'Releasing the asset reaches the actual rendered room');
 check(results.errors.length===0,'Delayed asset loading causes no browser exception');
 results.passed=true;
}finally{release();await writeFile('evidence/realism/loading-results.json',JSON.stringify(results,null,2));await browser.close();}
