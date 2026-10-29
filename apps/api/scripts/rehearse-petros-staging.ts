/** Full main.ts rehearsal. Allocates its own DB/Redis; accepts no targets or arguments.
 * env -u DATABASE_URL -u DATABASE_MIGRATION_URL pnpm --filter @edrion/database exec tsx
 *   --tsconfig ../../apps/api/tsconfig.json ../../apps/api/scripts/rehearse-petros-staging.ts
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn, execFile, execFileSync, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, symlinkSync, appendFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { createServer } from 'node:http';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, runInInstitutionTenant } from '@edrion/database';
import { hashPassword } from '../src/modules/authentication/password.util';
import { AuditWriter } from '@edrion/audit';
import { PETROS_EVALUATION_SCHEMA_VERSION } from '@edrion/schemas';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { startReadinessRehearsal, refuseApplicationTargets } from './rehearse-petros-v2-readiness-repair';
import { phase2AuthorityFixture } from '../src/modules/integrations/petros-phase2-authority-fixture';
import { PortalSessionService } from '../src/modules/portal/portal-session.service';
import { StudentSessionService } from '../src/modules/student/core/student-session.service';
import { fallbackDocumentTeachingPlan } from '../src/modules/student/petros-session-intent/petros-document-teaching';

const root = resolve(__dirname, '../../..');
const report = { date: '2026-10-09', startedAt: new Date().toISOString(), completedAt: '',
  configuredTargetConnected: false, paidProviderCalls: 0, localMockProviderCalls: 0,
  frozenSourceManifestSha256: '',
  environmentProfiles: { initial: { NODE_ENV:'production',PETROS_DOCUMENT_TEACHING_ENABLED:false,PETROS_AI_MODE:'demo',STUDENT_AUTH_DEV_HEADER:false },
    enabledSyntheticOnly: { NODE_ENV:'test',PETROS_DOCUMENT_TEACHING_ENABLED:true,PETROS_AI_MODE:'live',provider:'generated loopback mock only' } },
  checks: [] as { name: string; status: string; details?: unknown }[] };
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T>, accept: (x:T)=>boolean, ms=30000): Promise<T> {
  const deadline = Date.now() + ms;
  let error: unknown;
  while (Date.now() < deadline) {
    try { const v = await fn(); if (accept(v)) return v; } catch(e) { error=e; }
    await pause(100);
  }
  throw new Error(`Rehearsal deadline: ${String(error ?? 'condition not met')}`);
}
async function check(name: string, fn:()=>Promise<unknown>) {
  try { const details=await fn(); report.checks.push({name,status:'PASS',details}); console.log(`PASS ${name}`); }
  catch(e) { report.checks.push({name,status:'FAIL',details:String(e)}); throw e; }
}
async function port() {
  const server=net.createServer(); await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const value=(server.address() as net.AddressInfo).port; await new Promise<void>(r=>server.close(()=>r())); return value;
}
async function stopped(child?:ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await until(async()=>child.exitCode !== null || child.signalCode !== null,Boolean,10000)
    .catch(()=> {child.kill('SIGKILL');});
}

async function run() {
  refuseApplicationTargets(process.argv.slice(2));
  const f=await startReadinessRehearsal();
  let api: ChildProcess | undefined, redisProcess:ChildProcess | undefined;
  let redis:Redis|undefined, queue:Queue|undefined;
  let mockCalls=0;
  const provider=createServer(async(req,res)=> {
    try {
      assert.equal(req.url,'/v1/chat/completions');
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const request=JSON.parse(Buffer.concat(chunks).toString());
      const input=JSON.parse(request.messages.find((x:any)=>x.role==='user').content[0].text);
      const pin=input.immutableProvenance;
      if(!pin) {
        assert(input.prompt && typeof input.committedAnswer==='string','Only controlled assessment requests are supported');
        mockCalls++;res.setHeader('content-type','application/json');
        res.end(JSON.stringify({id:randomUUID(),choices:[{message:{content:JSON.stringify({schemaVersion:PETROS_EVALUATION_SCHEMA_VERSION,
          correctness:'partial',credit:0.5,evidence:['Synthetic engineering response only'],errorClass:'incomplete',misconception:null,
          feedback:'Synthetic controlled feedback. Explain which component gravity changes.',safeNextHint:'Compare horizontal and vertical components.'})}}],usage:{prompt_tokens:100,completion_tokens:50}}));return;
      }
      const content=fallbackDocumentTeachingPlan({documentId:pin.documentId,documentVersion:pin.documentVersion,
        sourceFingerprint:pin.sourceFingerprint,topicId:pin.topicId,title:input.concept.title,
        summary:input.concept.summary,prerequisites:[],pages:input.sourcePages,sourceComplete:pin.sourceComplete});
      // A valid physics mock must author a matching visual, rather than relying
      // on the generic development fixture's humanities concept map.
      if(content.subject==='physics') {
        const scene=content.scenes.find(x=>x.id==='visual-model')!;
        scene.activity='process_diagram';
        scene.activitySpec={kind:'process_diagram',orientation:'horizontal',relationship:'association',revealOrder:['horizontal','vertical'],
          accessibleSummary:'Horizontal velocity remains constant while uniform gravity changes vertical velocity.',
          nodes:[{id:'horizontal',label:'Horizontal motion',detail:'No horizontal force means constant horizontal velocity.'},
          {id:'vertical',label:'Vertical motion',detail:'Gravity changes vertical velocity.'}],edges:[{from:'horizontal',to:'vertical',label:'Analyze independent components'}]};
      }
      mockCalls++;res.setHeader('content-type','application/json');
      res.end(JSON.stringify({id:randomUUID(),choices:[{message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:100,completion_tokens:100}}));
    }catch(e){res.statusCode=500;res.end(JSON.stringify({error:{message:String(e)}}));}
  });
  await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  const sockets=new Set<net.Socket>();
  // URL-created production pools reach ONLY the newly allocated Unix-socket cluster.
  const proxy=net.createServer(socket=> {
    const upstream=net.connect(join(f.directory,'.s.PGSQL.5432'));
    for(const s of [socket,upstream]) { sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>s.destroy()); }
    socket.pipe(upstream).pipe(socket);
  });
  await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
  const databasePort=(proxy.address() as net.AddressInfo).port;
  const redisPort=await port(), apiPort=await port();
  const tree=join(realpathSync(f.directory),'package');
  const source=join(tree,'source');
  const databaseUrl=(role:string)=>`postgresql://${role}@127.0.0.1:${databasePort}/${f.databaseName}`;
  const childEnv={PATH:process.env.PATH!, NODE_ENV:'test', TS_NODE_PROJECT:join(source,'apps/api/tsconfig.json')};
  const logs:string[]=[];
  try {
    execFileSync('python3',[join(__dirname,'prepare-petros-staging-package.py'),'--destination',tree],{stdio:'pipe'});
    report.frozenSourceManifestSha256=createHash('sha256').update(readFileSync(join(tree,'manifest.json'))).digest('hex');
    for(const p of ['node_modules','apps/api/node_modules',...readdirSync(join(root,'packages')).filter(p=>existsSync(join(root,'packages',p,'node_modules'))).map(p=>`packages/${p}/node_modules`)])
      symlinkSync(join(root,p),join(source,p),'dir');
    // Resolve ALL workspace source aliases inside the frozen package, including otherwise
    // symlinked copilot/observability/feature-flags packages.
    const tsconfig=JSON.parse(readFileSync(join(source,'apps/api/tsconfig.json'),'utf8'));
    tsconfig.compilerOptions.paths['@edrion/*']=['../../packages/*/src/index.ts'];
    writeFileSync(join(source,'apps/api/tsconfig.json'),JSON.stringify(tsconfig,null,2));
    const guard=join(f.directory,'network-guard.cjs');
    writeFileSync(guard,`const net=require('node:net');const listen=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){if(typeof args[0]==='number' && typeof args[1]!=='string')args.splice(1,0,'127.0.0.1');return listen.apply(this,args)};
const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let a=args[0]; if(Array.isArray(a))a=a[0];
const host=typeof a==='object'?a.host:typeof args[1]==='string'?args[1]:'localhost';
const path=typeof a==='object'?a.path:typeof a==='string'?a:undefined;
if(path ? !path.startsWith(${JSON.stringify(f.directory)}) : !['127.0.0.1','localhost','::1'].includes(host||'localhost'))
throw new Error('M0R_OUTBOUND_NETWORK_REFUSED');return original.apply(this,args)};
const originalFetch=global.fetch;global.fetch=(input,...rest)=>{const u=new URL(typeof input==='string'?input:input.url||input.href);
if(u.hostname!=='127.0.0.1')throw new Error('M0R_OUTBOUND_FETCH_REFUSED');return originalFetch(input,...rest)};`);
    const environment:Record<string,string>={NODE_ENV:'production',DATABASE_URL:databaseUrl('edrion_app'),
      DATABASE_MIGRATION_URL:databaseUrl('petros_test'),REDIS_URL:`redis://127.0.0.1:${redisPort}`,
      API_PORT:String(apiPort),API_BASE_URL:`http://127.0.0.1:${apiPort}`,LOG_LEVEL:'error',
      SESSION_COOKIE_SECRET:'synthetic-staging-rehearsal-secret-32-characters',
      DOCUMENT_VERIFY_SECRET:'synthetic-distinct-document-signing-secret',
      PETROS_MEDIA_SIGNING_SECRET:'synthetic-distinct-media-signing-secret',
      STUDENT_AUTH_DEV_HEADER:'false',AUTH_DEV_HEADER:'false',AUTH_DEV_LOGIN:'false',
      PORTAL_AUTH_DEV_HEADER:'false',PORTAL_AUTH_DEV_LOGIN:'false',
      STUDENT_STORAGE_DIR:f.directory,STUDENT_STORAGE_DRIVER:'local',
      PETROS_AI_MODE:'demo',PETROS_DOCUMENT_TEACHING_ENABLED:'false',
      PETROS_CREDENTIAL_ENCRYPTION_KEY:'synthetic-only-local-provider-encryption-key',
      REDIS_ENABLED:'true',QUEUE_WORKERS_ENABLED:'true',RATE_LIMIT_ENABLED:'false',
      PETROS_DOCUMENT_WORKER_DATABASE_URL:databaseUrl('edrion_petros_document_worker'),
      PETROS_DOCUMENT_EVALUATOR_DATABASE_URL:databaseUrl('edrion_petros_document_evaluator')};
    function saveEnv() { writeFileSync(join(source,'.env'),Object.entries(environment).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600}); }
    saveEnv();
    await check('actual existing migrate.ts on historical installation, twice',async()=> {
      const before=await f.admin`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      const execute=async()=>(await promisify(execFile)(process.execPath,[
        '-r',guard,join(root,'packages/database/node_modules/tsx/dist/cli.mjs'),
        join(source,'packages/database/src/migrate.ts')],{cwd:source,env:childEnv,timeout:60000,encoding:'utf8'})).stdout;
      const first=await execute(); const after=await f.admin`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
      assert.deepEqual([...after].slice(0,before.length),[...before]);assert.equal(after.length,before.length+2);
      const second=await execute();assert.deepEqual(await f.admin`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,after);
      return {originalReceipts:before.length,newRealDisposableReceipts:2,first,second};
    });
    delete environment.DATABASE_MIGRATION_URL; // One-shot identity is never available to the API.
    redisProcess=spawn('redis-server',['--bind','127.0.0.1','--port',String(redisPort),
      '--dir',f.directory,'--save','','--appendonly','no'],{env:{PATH:process.env.PATH!},stdio:'ignore'});
    redis=new Redis(environment.REDIS_URL!,{maxRetriesPerRequest:1});redis.on('error',()=>undefined);
    await until(()=>redis!.ping(),v=>v==='PONG');
    const parsedEnv={NODE_ENV:'test',SESSION_COOKIE_SECRET:environment.SESSION_COOKIE_SECRET,
      SESSION_TTL_SECONDS:3600,STUDENT_SESSION_COOKIE_NAME:'edrion_student_session',PORTAL_SESSION_COOKIE_NAME:'edrion_portal_session'};
    const fixtureDatabase={adminSql:f.admin,appSql:f.app,db:f.tenantDb,tenantDb:f.tenantDb,
      auditWriter:new AuditWriter(f.tenantDb),directory:f.directory,close:f.close};
    const a=await phase2AuthorityFixture(fixtureDatabase), b=await phase2AuthorityFixture(fixtureDatabase);
    const password='Synthetic-Rehearsal-Password-2026';
    await f.admin`UPDATE institution_users SET password_hash=${await hashPassword(password)} WHERE id=${a.student.institutionUserId}`;
    const portalSessions=new PortalSessionService(f.tenantDb,parsedEnv as never);
    const teacher=await runInInstitutionTenant(f.tenantDb,a.institutionId,()=>portalSessions.issue({institutionId:a.institutionId,institutionUserId:a.teacherUserId,aal:'aal2'}));
    const foreignTeacher=await runInInstitutionTenant(f.tenantDb,b.institutionId,()=>portalSessions.issue({institutionId:b.institutionId,institutionUserId:b.teacherUserId,aal:'aal2'}));
    const studentSessions=new StudentSessionService(f.tenantDb,parsedEnv as never);
    const foreign=await runInInstitutionTenant(f.tenantDb,b.institutionId,()=>studentSessions.issue({kind:'institutional',institutionId:b.institutionId,userId:b.student.institutionUserId}));
    let studentCookie='';
    const teacherCookie=`${portalSessions.cookieName}=${teacher.token}`;
    const foreignTeacherCookie=`${portalSessions.cookieName}=${foreignTeacher.token}`;
    const foreignCookie=`${studentSessions.cookieName}=${foreign.token}`;
    async function http(path:string,method='GET',body?:unknown,cookie?:string,extra:Record<string,string>={}) {
      const response=await fetch(`http://127.0.0.1:${apiPort}/v1${path}`,{method,
        headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},
        body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const text=await response.text();let data: any;try {data=JSON.parse(text);}catch {data=text;}
      return {status:response.status,headers:response.headers,body:data};
    }
    async function boot() {
      saveEnv(); const start=logs.length;
      api=spawn(process.execPath,['-r',guard,'-r',join(root,'apps/api/node_modules/ts-node/register'),
        '-r',join(root,'apps/api/node_modules/tsconfig-paths/register'),join(source,'apps/api/src/main.ts')],
        {cwd:join(source,'apps/api'),env:childEnv,stdio:['ignore','pipe','pipe']});
      for(const stream of [api.stdout,api.stderr])stream?.on('data',x=> {logs.push(x.toString());appendFileSync('/tmp/petros-staging-application-live.log',x.toString());});
      const deadline=Date.now()+60000;
      while(Date.now()<deadline) {
        if(api.exitCode!==null)throw new Error(logs.slice(start).join('').slice(-8000));
        try {if((await http('/health')).status===200)return;}catch { /* bounded startup */ }
        await pause(100);
      }
      throw new Error('Full application startup deadline exceeded');
    }
    await check('actual main.ts + complete AppModule production-mode containment boot',async()=> {await boot();return (await http('/health')).body;});
    await check('real student password login; missing/dev-header/foreign sessions denied',async()=> {
      assert.equal((await http('/student/petros/sessions/history')).status,401);
      assert.equal((await http('/student/petros/sessions/history','GET',undefined,undefined,{'x-student-email':a.student.email})).status,401);
      assert.equal((await http('/student/auth/login','POST',{identifier:a.student.email,password:'wrong-password-2026'})).status,401);
      const r=await http('/student/auth/login','POST',{identifier:a.student.email,password});assert.equal(r.status,200,JSON.stringify(r.body));
      studentCookie=r.headers.get('set-cookie')!.split(';')[0]!;
      const history=await http('/student/petros/sessions/history','GET',undefined,studentCookie);assert.equal(history.status,200,JSON.stringify(history.body));
      assert.equal((await http(`/student/petros/sessions/${a.sessionId}`,'GET',undefined,foreignCookie)).status,404);
      return {login:200,history:200,foreign:404};
    });
    await check('initial containment rejects unapproved document preparation without writes',async()=> {
      const before=await f.admin`SELECT count(*)::int n FROM petros_document_preparations`;
      const r=await http(`/student/petros/documents/${a.source.id}/prepare`,'POST',{idempotencyKey:randomUUID(),timeBudgetSeconds:600},studentCookie);
      assert.equal(r.status,503,JSON.stringify(r.body));
      assert.deepEqual(await f.admin`SELECT count(*)::int n FROM petros_document_preparations`,before);assert.equal(mockCalls,0);return r.body;
    });
    await stopped(api);
    environment.NODE_ENV='test';
    environment.PETROS_DOCUMENT_TEACHING_ENABLED='true';
    environment.PETROS_AI_MODE='live'; // ONLY the local controlled provider is seeded.
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(environment.PETROS_CREDENTIAL_ENCRYPTION_KEY!).digest(),iv);
    const encrypted=Buffer.concat([cipher.update('synthetic-local-only-token'),cipher.final()]);
    const envelope=JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
    const admin=drizzle(f.admin,{schema});
    const [mockProvider]=await admin.insert(schema.petrosAiProviders).values({key:'m0r-local-mock',displayName:'Synthetic local mock',adapterType:'openai',
      baseUrl:`http://127.0.0.1:${(provider.address() as net.AddressInfo).port}/v1`,credentialEnvelope:envelope,healthStatus:'healthy'}).returning();
    const [fn]=await f.admin`SELECT id,required_capabilities FROM petros_ai_functions WHERE key='document.teaching.plan'`;
    assert(fn,'Full application must have initialized the registry');
    const [model]=await admin.insert(schema.petrosAiModels).values({providerId:mockProvider!.id,modelKey:'synthetic-local-mock',displayName:'Synthetic local mock',
      capabilities:[...new Set([...(fn.required_capabilities as string[]),'text','json','reasoning'])],pricing:{inputPerMillionMicros:0,outputPerMillionMicros:0}}).returning();
    await admin.insert(schema.petrosAiFunctionRoutes).values({functionId:fn.id,providerId:mockProvider!.id,modelId:model!.id});
    const [evaluationFn]=await f.admin`SELECT id FROM petros_ai_functions WHERE key='answer.evaluate'`;
    await admin.insert(schema.petrosAiFunctionRoutes).values({functionId:evaluationFn!.id,providerId:mockProvider!.id,modelId:model!.id});
    for(const key of ['PETROS_DOCUMENT_RETRIEVAL_ENABLED','PETROS_ADAPTIVE_TEACHING_ENABLED','PETROS_CURRICULUM_ALIGNMENT_ENABLED'])environment[key]='true';
    await check('full AppModule URL-created restricted app/worker/evaluator pools',async()=> {
      await boot();const users=await f.admin`SELECT DISTINCT usename FROM pg_stat_activity WHERE datname=${f.databaseName}`;
      for(const role of ['edrion_app','edrion_petros_document_worker','edrion_petros_document_evaluator']) assert(users.some(x=>x.usename===role));
      return users.map(x=>x.usename);
    });
    await check('real teacher material upload/publication and foreign course denial',async()=> {
      const path=`/portal/course-content/materials/publish?filename=synthetic.txt&contextType=course&contextId=${a.course.id}&subjectId=${a.subjectId}`;
      const bytes=Buffer.from('Synthetic authorized source. Horizontal velocity is constant without drag. Gravity changes vertical velocity.');
      assert.equal((await http(path,'POST',bytes,foreignTeacherCookie,{'Content-Type':'text/plain'})).status,404);
      const r=await http(path,'POST',bytes,teacherCookie,{'Content-Type':'text/plain'});
      assert.equal(r.status,201,JSON.stringify(r.body));return {published:201,foreign:404};
    });
    await check('real pack compile and qualified review HTTP',async()=> {
      const compile=await http('/portal/petros/teaching-packs/candidates/compile','POST',a.compileCommand,teacherCookie);
      assert.equal(compile.status,201,JSON.stringify(compile.body));
      const path=`/portal/petros/teaching-packs/candidates/${a.compiled.candidateId}/reviews`;
      const unqualified=await http(path,'POST',a.reviewCommand,teacherCookie);assert.equal(unqualified.status,403,JSON.stringify(unqualified.body));
      await a.qualify();const qualified=await http(path,'POST',a.reviewCommand,teacherCookie);assert.equal(qualified.status,201,JSON.stringify(qualified.body));
      assert.equal((await http(path,'POST',a.reviewCommand,foreignTeacherCookie)).status,404);
      return {compiled:201,unqualified:403,qualified:201,foreign:404};
    });
    let preparationId='';
    await check('student preparation HTTP -> real BullMQ -> restricted worker -> public read',async()=> {
      const r=await http(`/student/petros/documents/${a.source.id}/prepare`,'POST',{idempotencyKey:randomUUID(),timeBudgetSeconds:600},studentCookie);
      assert.equal(r.status,201,JSON.stringify(r.body));preparationId=r.body.preparation.id;
      const ready=await until(()=>http(`/student/petros/document-preparations/${preparationId}`,'GET',undefined,studentCookie),x=>x.body.status==='ready',45000);
      assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'private, no-store');
      assert(!/privatePlan|answerKey|referenceAnswer|rubric|documentTeachingInternalPlan/.test(JSON.stringify(ready.body)));
      assert.equal((await http(`/student/petros/document-preparations/${preparationId}`,'GET',undefined,foreignCookie)).status,404);
      assert(mockCalls>0,'Actual provider HTTP adapter must reach the local controlled provider');
      return {status:ready.body.status,localMockProviderCalls:mockCalls,attempts:(await f.admin`SELECT attempt_count FROM petros_document_preparations WHERE id=${preparationId}`)[0]!.attempt_count};
    });
    await check('document session start and private evaluator over real HTTP, with public-only responses',async()=> {
      const resolved=await http('/student/petros/intents/resolve','POST',{door:'uploaded_document',sourceId:a.source.id,
        idempotencyKey:randomUUID(),timeBudgetSeconds:600},studentCookie,{'x-petros-document-source':'petros.document-source.v1'});
      assert.equal(resolved.status,201,JSON.stringify(resolved.body));
      const command={idempotencyKey:randomUUID(),plan:{topicId:resolved.body.planning.suggestedTopicId,
        priority:'understand',timeBudgetSeconds:600,existingDoubt:null}};
      const started=await until(()=>http(`/student/petros/intents/${resolved.body.id}/start`,'POST',command,studentCookie),x=>x.status===201 && Boolean(x.body.session),45000);
      const session=started.body.session.session ?? started.body.session;
      assert(session.id,JSON.stringify(started.body));
      assert(!/privatePlan|answerKey|referenceAnswer|documentTeachingInternalPlan/.test(JSON.stringify(started.body)));
      const assessed=await http(`/student/petros/sessions/${session.id}/document-teaching`,'POST',{
        action:'diagnostic',answer:'synthetic controlled answer',expectedVersion:session.version,idempotencyKey:randomUUID()},studentCookie);
      assert.equal(assessed.status,201,JSON.stringify(assessed.body));
      assert(!/privatePlan|answerKey|referenceAnswer|documentTeachingInternalPlan/.test(JSON.stringify(assessed.body)));
      assert.equal((await http(`/student/petros/sessions/${session.id}`,'GET',undefined,foreignCookie)).status,404);
      return {started:201,assessed:201,foreign:404};
    });
    await check('new Petros session HTTP create/pause/resume; V1 history retained',async()=> {
      const created=await http('/student/petros/sessions','POST',{clientRequestId:randomUUID(),topic:'Synthetic forces',goal:'Explain constant horizontal motion',timeBudgetSeconds:600,maxMoves:4},studentCookie);
      assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.session?.id ?? created.body.id;
      assert(id,JSON.stringify(created.body));
      for(const action of ['pause','resume']) {const r=await http(`/student/petros/sessions/${id}/${action}`,'POST',{idempotencyKey:randomUUID()},studentCookie);assert.equal(r.status,201,JSON.stringify(r.body));}
      const history=await http('/student/petros/sessions/history','GET',undefined,studentCookie);assert.equal(history.status,200);
      assert(JSON.stringify(history.body).includes(id));
      const other=await http('/student/petros/sessions','POST',{clientRequestId:randomUUID(),topic:'Synthetic forces',goal:'Explain constant horizontal motion',timeBudgetSeconds:600,maxMoves:4},foreignCookie);
      assert.equal(other.status,201,JSON.stringify(other.body));
      const audits=await f.admin`SELECT DISTINCT institution_id FROM petros_topic_profile_audits WHERE institution_id IN (${a.institutionId},${b.institutionId})`;
      assert.equal(audits.length,2);return {created:201,paused:201,resumed:201,institutionAudits:2};
    });
    await check('real app queue retry, Redis loss and recovery',async()=> {
      queue=new Queue('maintenance',{connection:{host:'127.0.0.1',port:redisPort}});
      const missing=await queue.add('m0r.missing-handler',{}, {attempts:2,backoff:{type:'fixed',delay:50},removeOnFail:false});
      await until(()=>missing.getState(),x=>x==='failed');const failed=await queue.getJob(missing.id!);assert.equal(failed!.attemptsMade,2);
      await stopped(redisProcess);assert.equal((await http('/health')).status,200);
      redisProcess=spawn('redis-server',['--bind','127.0.0.1','--port',String(redisPort),'--dir',f.directory,'--save','','--appendonly','no'],{env:{PATH:process.env.PATH!},stdio:'ignore'});
      await until(()=>redis!.ping(),v=>v==='PONG');
      const marker=`m0r:${randomUUID()}`;const ping=await queue.add('system.ping',{marker});
      await until(()=>redis!.get(marker),x=>x==='done');assert.equal(await ping.getState(),'completed');
      return {retryAttempts:failed!.attemptsMade,redisLost:true,recovered:true};
    });
    await check('current enrollment revocation and session logout deny cached reads',async()=> {
      await f.admin`DELETE FROM course_enrollments WHERE course_id=${a.course.id} AND student_id=${a.student.studentId}`;
      assert.equal((await http(`/student/petros/document-preparations/${preparationId}`,'GET',undefined,studentCookie)).status,404);
      assert.equal((await http('/student/auth/logout','POST',{},studentCookie)).status,200);
      assert.equal((await http('/student/petros/sessions/history','GET',undefined,studentCookie)).status,401);
      return {withdrawn:404,revokedCookie:401};
    });
    await stopped(api);
    await check('full bootstrap rejects missing dedicated credentials without fallback',async()=> {
      delete environment.PETROS_DOCUMENT_WORKER_DATABASE_URL;saveEnv();
      const start=logs.length;
      api=spawn(process.execPath,['-r',guard,'-r',join(root,'apps/api/node_modules/ts-node/register'),'-r',join(root,'apps/api/node_modules/tsconfig-paths/register'),join(source,'apps/api/src/main.ts')],{cwd:join(source,'apps/api'),env:childEnv,stdio:['ignore','pipe','pipe']});
      for(const stream of [api.stdout,api.stderr])stream?.on('data',x=>logs.push(x.toString()));
      await until(async()=>api!.exitCode!==null,Boolean,60000);assert.notEqual(api.exitCode,0);
      assert(logs.slice(start).join('').includes('PETROS_DOCUMENT_RESTRICTED_DATABASE_REQUIRED'));
      await assert.rejects(()=>http('/health'));return {exitCode:api.exitCode};
    });
    environment.PETROS_DOCUMENT_WORKER_DATABASE_URL=databaseUrl('edrion_petros_document_worker');
    await check('full bootstrap rejects superuser ordinary URL before listening',async()=> {
      environment.DATABASE_URL=databaseUrl('petros_test');saveEnv();
      const start=logs.length;
      api=spawn(process.execPath,['-r',guard,'-r',join(root,'apps/api/node_modules/ts-node/register'),'-r',join(root,'apps/api/node_modules/tsconfig-paths/register'),join(source,'apps/api/src/main.ts')],{cwd:join(source,'apps/api'),env:childEnv,stdio:['ignore','pipe','pipe']});
      for(const stream of [api.stdout,api.stderr])stream?.on('data',x=>logs.push(x.toString()));
      await until(async()=>api!.exitCode!==null,Boolean,60000);assert.notEqual(api.exitCode,0);
      assert(logs.slice(start).join('').includes('PETROS_APPLICATION_DATABASE_ROLE_UNSAFE'));
      await assert.rejects(()=>http('/health'));return {exitCode:api.exitCode};
    });
  } finally {
    await stopped(api);await queue?.close();redis?.disconnect();await stopped(redisProcess);
    for(const socket of sockets)socket.destroy();await new Promise<void>(r=>proxy.close(()=>r()));
    provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));
    report.localMockProviderCalls=mockCalls;report.completedAt=new Date().toISOString();
    writeFileSync(join(root,'docs/verification/petros-v2/staging-application-results.json'),JSON.stringify(report,null,2)+'\n');
    writeFileSync('/tmp/petros-staging-application.log',logs.join(''));
    await f.close();
  }
}
run().catch(e=> {console.error(e);process.exitCode=1;});
