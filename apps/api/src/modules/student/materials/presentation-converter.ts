import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Convert the original presentation into a structured deck or a rendered PDF. */
export async function convertPresentation(buffer: Buffer, extension: 'ppt' | 'pptx' | 'odp', format: 'pdf' | 'pptx'): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'edrion-presentation-'));
  try {
    const inputPath = join(workDir, `source.${extension}`);
    const outputDir = join(workDir, 'output');
    await mkdir(outputDir);
    await writeFile(inputPath, buffer);
    await execFileAsync(await presentationConverter(), [
      '--headless',
      `-env:UserInstallation=${pathToFileURL(join(workDir, 'libreoffice-profile')).href}`,
      '--convert-to', format, '--outdir', outputDir, inputPath,
    ], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
    return await readFile(join(outputDir, `source.${format}`));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function presentationConverter(): Promise<string> {
  const configured = process.env.MATERIAL_PREVIEW_CONVERTER_BIN?.trim();
  if (configured) return configured;
  const candidates = process.platform === 'darwin'
    ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice', '/opt/homebrew/bin/soffice', '/usr/local/bin/soffice']
    : ['/usr/bin/soffice', '/usr/local/bin/soffice'];
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Try the next installation. */ }
  }
  return 'soffice';
}

/** M2 uses the existing Office converter only through an OS-enforced, credential-free renderer. */
export async function convertPresentationForM2(buffer: Buffer, extension: 'ppt'|'pptx', signal: AbortSignal, binary='/Applications/LibreOffice.app/Contents/MacOS/soffice'): Promise<Buffer> {
  signal.throwIfAborted();
  // Binary PPT original-slide inventory/mapping has not been qualified. Never pretend it is native PPTX.
  if (extension === 'ppt') throw new Error('PETROS_M2_LEGACY_ISOLATION_REQUIRED');
  if (process.platform !== 'darwin') throw new Error('PETROS_M2_OFFICE_SANDBOX_UNAVAILABLE');
  if(!binary.endsWith('.app/Contents/MacOS/soffice')) throw new Error('PETROS_M2_OFFICE_BINARY_UNQUALIFIED');
  try { await access(binary); await access('/usr/bin/sandbox-exec'); } catch { throw new Error('PETROS_M2_OFFICE_SANDBOX_UNAVAILABLE'); }
  const workDir=await realpath(await mkdtemp(join(tmpdir(),'petros-office-isolated-')));
  const appRoot=binary.slice(0,binary.indexOf('/Contents/MacOS/')),input=join(workDir,'source.pptx'),out=join(workDir,'output');
  try {
    if (buffer.length>20*1024*1024) throw new Error('PETROS_DOCUMENT_LIMIT');
    await mkdir(out);await writeFile(input,buffer);
    const literal=(v:string)=>JSON.stringify(v);
    const profile=`(version 1) (deny default)
      (allow process-fork) (allow process-exec (subpath ${literal(appRoot)}) (literal "/bin/bash"))
      (allow sysctl-read) (allow mach-lookup) (allow file-read-metadata)
      (allow file-read* (subpath "/System/Library") (subpath "/usr/lib") (subpath "/Library/Fonts")
        (subpath ${literal(appRoot)}) (literal "/") (literal "/bin/bash") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))
      (allow file-read* file-write* (subpath ${literal(workDir)}))`;
    await new Promise<void>((resolve,reject)=>{
      const child=spawn('/usr/bin/sandbox-exec',['-p',profile,'/bin/bash','-c','ulimit -t 20; ulimit -f 102400; exec "$@"','petros-office',binary,
        '--headless','--nologo','--nodefault','--norestore',`-env:UserInstallation=${pathToFileURL(join(workDir,'profile')).href}`,
        '--convert-to','pdf','--outdir',out,input],{cwd:workDir,detached:true,env:{PATH:'/usr/bin:/bin',TMPDIR:workDir,LANG:'C'},stdio:['ignore','pipe','pipe']});
      let error:Error|undefined,bytes=0,checking=false;
      const kill=(code:string)=>{error??=new Error(code);try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{/* exited */}};
      const abort=()=>kill('PETROS_PREPARATION_CANCELLED');signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      const timeout=setTimeout(()=>kill('PETROS_M2_OFFICE_TIMEOUT'),20000);
      const monitor=setInterval(()=>{
        if(checking||!child.pid)return;checking=true;
        execFile('/bin/ps',['-axo','pid=,ppid=,rss='],{timeout:500,maxBuffer:1024*1024},(err,stdout)=>{
          checking=false;if(err)return kill('PETROS_M2_OFFICE_MONITOR_FAILED');
          const rows=stdout.trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number)),ids=new Set([child.pid!]);
          let changed=true;while(changed){changed=false;for(const [pid,parent] of rows)if(pid&&parent&&ids.has(parent)&&!ids.has(pid)){ids.add(pid);changed=true;}}
          const rss=rows.reduce((n,[pid,,r])=>n+(pid&&ids.has(pid)?r??0:0),0);if(rss>524288||ids.size>16)kill('PETROS_M2_OFFICE_RESOURCE_LIMIT');
        });
      },100);
      for(const stream of [child.stdout,child.stderr])stream?.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2*1024*1024)kill('PETROS_M2_OFFICE_OUTPUT_LIMIT');});
      child.on('error',()=>kill('PETROS_M2_OFFICE_SANDBOX_UNAVAILABLE'));
      child.on('close',code=>{clearTimeout(timeout);clearInterval(monitor);signal.removeEventListener('abort',abort);
        if(error)reject(error);else if(code!==0)reject(new Error('PETROS_M2_OFFICE_CONVERSION_FAILED'));else resolve();});
    });
    const pdf=await readFile(join(out,'source.pdf'));
    if(pdf.length>20*1024*1024||!pdf.subarray(0,16).includes(Buffer.from('%PDF-')))throw new Error('PETROS_M2_OFFICE_OUTPUT_INVALID');
    return pdf;
  }finally{await rm(workDir,{recursive:true,force:true});}
}
