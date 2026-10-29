import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
const out = process.env.PETROS_M5_INPUT_DIR;
if (!out || existsSync(out)) throw Error('NEW_DIRECTORY_REQUIRED'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
const checks = [], errors = [];
const check = (passed, label) => { checks.push({ passed: !!passed, label }); if (!passed) throw Error(label); };
const button = (p, name) => p.getByRole('button', { name, exact: true });
async function wait(p, predicate) { for(let i=0;i<120;i++){if(predicate(p._s))return;await p.waitForTimeout(150);}throw Error('Authoritative session update timed out'); }
async function command(p, name, keyboard = false) { const r=p._s.revision; const b=button(p,name); if(keyboard){await b.focus();await p.keyboard.press('Enter');}else await b.click();await wait(p,s=>s?.revision>r);await p.waitForTimeout(200); }
async function typed(p, label, text) { await p.getByRole('spinbutton',{name:label,exact:true}).focus(); await p.keyboard.type(text); }
for(const mode of ['keyboard', 'ports', 'touch']) {
  const c=await browser.newContext({viewport:{width:mode==='touch'?360:1440,height:1000},...(mode==='touch'?{isMobile:true,hasTouch:true}:{}),recordVideo:{dir:out+'/raw'}}); const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  p.on('response',async r=>{if(r.url().includes('/v1/student/petros/v2/sessions/')&&r.request().method()==='GET'&&r.status()===200){const s=await r.json().catch(()=>null);if(s?.engine==='v2')p._s=s;}});
  try {
    await p.goto('http://127.0.0.1:4943/demo/companion?fresh=1');await button(p,'Submit answer').waitFor();await wait(p,s=>!!s);
    await p.getByRole('radio',{name:'Provider',exact:true}).focus();await p.keyboard.press('Space');
    await typed(p,'Available memory (GB)','48');await typed(p,'Whole-VM capacity (VM)','6');
    if(mode==='keyboard') {await command(p,'Save draft',true);const id=p._s.id;await p.reload();await button(p,'Submit answer').waitFor();check(await p.getByRole('spinbutton',{name:'Available memory (GB)',exact:true}).inputValue()==='48'&&p._s.id===id,'Keyboard saved draft survives reload without evaluation');}
    await button(p,'Submit answer').focus();await p.keyboard.press('Enter');await wait(p,s=>s?.submission?.status==='complete');await command(p,'Work on this with Petros',mode==='keyboard');
    while(p._s.teaching.status==='presenting') await command(p,'Show next teaching step',mode==='keyboard');
    const node=button(p,'Guest operating system');
    if(mode==='keyboard') {
      await p.getByLabel('From',{exact:true}).focus();await p.keyboard.press('g');check(await p.getByLabel('From',{exact:true}).inputValue()==='guest-os','Keyboard chooses actual source element');
      await p.getByLabel('To',{exact:true}).focus();await p.keyboard.press('c');check(await p.getByLabel('To',{exact:true}).inputValue()==='consumer','Keyboard chooses actual destination element');
      await command(p,'Save relationship',true);
    } else if(mode==='ports') {
      await p.getByLabel('New connection relationship',{exact:true}).selectOption('connects');await node.click();const handle=p.getByRole('button',{name:'Connect from Guest operating system (left)',exact:true});await handle.scrollIntoViewIfNeeded();const a=await handle.boundingBox(),b=await button(p,'Consumer · IaaS').boundingBox();const r=p._s.revision;
      await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:20});await p.mouse.up();await wait(p,s=>s?.revision>r);check(p._s.canvas.elements.some(e=>e.kind==='edge'&&e.from==='guest-os'&&e.to==='consumer'),'Dragging a connection port creates a server accepted edge');
      await command(p,'Undo diagram edit');check(!p._s.canvas.elements.some(e=>e.kind==='edge'&&e.editable),'Undo removes actual port-created edge');await command(p,'Redo diagram edit');
    } else {
      await node.scrollIntoViewIfNeeded();const a=await node.boundingBox(),before=p._s.canvas.elements.find(e=>e.id==='guest-os'),r=p._s.revision;const cdp=await c.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});for(let n=1;n<=10;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+a.width/2+n*3,y:a.y+a.height/2-n*2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(p,s=>s?.revision>r);const after=p._s.canvas.elements.find(e=>e.id==='guest-os');check(after.x!==before.x||after.y!==before.y,'360px emulated touch drag persists node geometry');
      await p.getByLabel('From',{exact:true}).selectOption('guest-os');await p.getByLabel('To',{exact:true}).selectOption('consumer');await command(p,'Save relationship');
    }
    await command(p,'Use this work for the reviewed practice task',mode==='keyboard');const answer=p.getByRole('textbox',{name:'Your answer',exact:true});await answer.focus();await p.keyboard.type('In IaaS the consumer manages the guest operating system.');await button(p,'Submit answer').focus();await p.keyboard.press('Enter');await wait(p,s=>s?.submission?.status==='complete');check(p._s.evaluation.criteria.every(x=>x.status==='satisfied'),`${mode} work is really committed and privately evaluated`);await p.screenshot({path:`${out}/${mode}.png`,fullPage:true});
  } catch(e){errors.push({mode,error:String(e)});await p.screenshot({path:`${out}/${mode}-failure.png`,fullPage:true});}
  const video=p.video();await c.close();copyFileSync(await video.path(),`${out}/${mode}.webm`);
}
await browser.close();writeFileSync(`${out}/results.json`,JSON.stringify({checks,errors,qualification:'Actual desktop keyboard/mouse and Chromium mobile touch emulation. No physical device qualification.'},null,2));process.stdout.write(JSON.stringify({checks,errors},null,2));if(errors.length)process.exitCode=1;
