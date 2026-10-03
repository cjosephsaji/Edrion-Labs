import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('/Volumes/Chris/Edrion Labs/apps/api/package.json');
const {chromium}=require('playwright-core');
const meta=JSON.parse(fs.readFileSync('/tmp/petros-phase6-browser.json','utf8'));
const out='/Volumes/Chris/Edrion Labs/docs/verification/petros-phase6-20261003/candidate/screenshots';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
for(const [size,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const context=await browser.newContext({viewport,reducedMotion:'reduce'});
 await context.addCookies([{name:meta.cookieName,value:meta.token,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage();
 for(const [name,route] of [['home','/home'],['entry','/petros'],['materials','/materials'],['notebook','/petros/artifacts'],['lesson',`/petros/session?session=${meta.sessionId}`]]){
  await page.goto(meta.web+route);await page.waitForLoadState('networkidle');
  await page.screenshot({path:`${out}/${size}-${name}.png`,fullPage:true});
 }
 await context.close();
}
await browser.close();
