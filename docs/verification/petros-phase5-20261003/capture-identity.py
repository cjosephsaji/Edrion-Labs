import datetime, hashlib, json, pathlib, subprocess, sys
root=pathlib.Path('/Volumes/Chris/Edrion Labs')
out=root/'docs/verification/petros-phase5-20261003'/sys.argv[1]
out.mkdir(exist_ok=True)
def git(*args): return subprocess.check_output(['git',*args],cwd=root)
def sha(value): return hashlib.sha256(value).hexdigest()
exclude={'docs/PETROS-PHASE-5-VERIFICATION-RESULTS.md','docs/PETROS-PHASE-4-VERIFICATION-RESULTS.md','docs/PETROS-PHASE-3-VERIFICATION-RESULTS.md','docs/PETROS-PHASE-3-OWNER-MATRIX.md','docs/PETROS-PHASE-3-DECISIONS.md','docs/PETROS-PHASE-3-VERIFICATION-PLAN.md','docs/PETROS-LEARNING-HARNESS-PLAN.md','docs/PETROS-PHASE-2-DEFERRED-VERIFICATION-PLAN.md','docs/PETROS-PHASE-2-OWNER-MATRIX.md','docs/PETROS-PHASE-2-VERIFICATION-RESULTS.md'}
paths=sorted(set(p.decode() for p in git('ls-files','--cached','--others','--exclude-standard','-z').split(bytes([0])) if p))
paths=[p for p in paths if p not in exclude and not p.startswith('docs/verification/')]
manifest=''.join(f'{sha((root/p).read_bytes())}  {p}\n' for p in paths if (root/p).is_file())
untracked=set(p.decode() for p in git('ls-files','--others','--exclude-standard','-z').split(bytes([0])) if p)
untracked_manifest=''.join(line for line in manifest.splitlines(keepends=True) if line[66:].rstrip('\n') in untracked)
diff=git('diff','--binary','--no-ext-diff','HEAD')
protected=['pnpm-lock.yaml','edrion_database_dump.sql','edrion_database_dump.sql.gz','docs/PETROS-PHASE-1-VERIFICATION-RESULTS.md']
hashes={p:sha((root/p).read_bytes()) for p in protected}
baseline=json.loads((root/'docs/verification/petros-phase2-20260922/baseline/identity.json').read_text())
assert hashes==baseline['hashes'],hashes
record={'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'head':git('rev-parse','HEAD').decode().strip(),'branch':git('branch','--show-current').decode().strip(),'trackedDiffSha256':sha(diff),'sourceManifestSha256':sha(manifest.encode()),'sourceManifestFileCount':len(manifest.splitlines()),'relevantUntrackedSha256':sha(untracked_manifest.encode()),'relevantUntrackedFileCount':len(untracked_manifest.splitlines()),'protectedHashes':hashes,'exclusions':{'prefixes':['docs/verification/'],'paths':sorted(exclude),'ignored':'Git-ignored build output, dependencies and runtime files are not selected by git ls-files --cached --others --exclude-standard.'},'manifestFormat':'SHA-256 of file bytes, two spaces, repository-relative path, newline; paths sorted lexicographically. Includes tracked and nonignored untracked files. Tracked diff uses git diff --binary --no-ext-diff HEAD.'}
(out/'identity.json').write_text(json.dumps(record,indent=2)+'\n')
(out/'source-sha256.txt').write_text(manifest)
(out/'untracked-sha256.txt').write_text(untracked_manifest)
(out/'tracked-diff.patch').write_bytes(diff)
(out/'status.txt').write_bytes(git('status','--short'))
print(json.dumps(record,indent=2))
