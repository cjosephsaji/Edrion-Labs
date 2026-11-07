/** Deterministic regression: a slow worker edit must survive auto-play ticks. */
import { chromium } from 'playwright-core';
import { browserExecutable } from './browser-executable';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import type { Simulation } from '../simulations/runtime';
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  // Delay delivery only. The real worker executes every original engine request.
  await context.addInitScript(`
    window.__name=(value)=>value;
    window.__petrosSlowWorkerResponses=0;
    const send=Worker.prototype.postMessage;
    const descriptor=Object.getOwnPropertyDescriptor(Worker.prototype,'onmessage');
    const edits=new WeakMap();
    Worker.prototype.postMessage=function(message,options){
      if(message?.tool==='sim_set_params'){
        if(!edits.has(this))edits.set(this,new Set());
        edits.get(this).add(message.requestId);
      }
      return send.call(this,message,options);
    };
    Object.defineProperty(Worker.prototype,'onmessage',{
      ...descriptor,
      set(listener){
        if(!listener)return descriptor.set.call(this,listener);
        return descriptor.set.call(this,(event)=>{
          if(edits.get(this)?.delete(event.data.requestId))
            setTimeout(()=>{window.__petrosSlowWorkerResponses++;listener.call(this,event)},180);
          else listener.call(this,event);
        });
      }
    });
  `);
  const page = await context.newPage(),
    errors: string[] = [],
    paid: string[] = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\/(teacher|teach|speech|voice)(\/|$|\?)/.test(r.url()))
      paid.push(r.url());
  });
  const base = process.env.PETROS_BASE_URL ?? 'http://127.0.0.1:3022';
  await page.goto(base + '/prototype?view=stage&lesson=traffic');
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.introComplete === 'true',
  );
  const data = async () =>
    JSON.parse((await page.locator('#petros-observations').textContent())!) as {
      sim: Simulation;
    };
  await page.getByRole('button', { name: 'Run road', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.time >= 0.4,
  );
  const before = (await data()).sim.time;
  const edit = (value: number) =>
    page.locator('#stage-headway').evaluate((el, v) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  await edit(2);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.params.headway === 2,
  );
  for (const value of [0.5, 1.3, 1.7, 2.6]) {
    await edit(value);
    await page.waitForTimeout(35);
  }
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.params.headway === 2.6,
  );
  await page.waitForTimeout(500);
  const edited = (await data()).sim;
  assert.equal(edited.params.headway, 2.6);
  assert.ok(edited.time > before);
  assert.equal(
    await page.getByRole('button', { name: 'Pause road', exact: true }).count(),
    1,
  );
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#petros-observations')!.textContent!)
        .sim.time === 0,
  );
  await page.waitForTimeout(500);
  assert.equal((await data()).sim.time, 0);
  assert.equal((await data()).sim.params.headway, 1.2);
  const delayedEditResponses = await page.evaluate(
    () => Reflect.get(window, '__petrosSlowWorkerResponses') as number,
  );
  assert.ok(
    delayedEditResponses >= 5,
    'The actual worker must exercise all delayed edits',
  );
  assert.equal(
    await page.getByRole('button', { name: 'Run road', exact: true }).count(),
    1,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(paid, []);
  const out = new URL(
    '../../../audit-screenshots/stage-traffic/',
    import.meta.url,
  );
  await mkdir(out, { recursive: true });
  await writeFile(
    new URL('worker-coordination-results.json', out),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        responseDelayMs: 180,
        delayedEditResponses,
        autoIntervalMs: 100,
        beforeTime: before,
        editedTime: edited.time,
        rapidEditsFinalHeadway: edited.params.headway,
        resetRemainsPaused: true,
        errors,
        paid,
      },
      null,
      2,
    ),
  );
  process.stdout.write('Slow worker / auto-play input coordination passed.\n');
} finally {
  await browser.close();
}
