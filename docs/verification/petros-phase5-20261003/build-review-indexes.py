import datetime, hashlib, json, pathlib, re

root = pathlib.Path('/Volumes/Chris/Edrion Labs')
base = root / 'docs/verification/petros-phase5-20261003'
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
identity = json.loads((base / 'frozen-final-r5/identity.json').read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def artifact(p): return {'path': str(p.relative_to(root)), 'sha256': sha(p)}
def write(name, value):
    (base / name).write_text(json.dumps(value, indent=2) + '\n')
def manifest(name):
    return {line[66:]: line[:64] for line in (base / name / 'source-sha256.txt').read_text().splitlines()}
entry, frozen = manifest('entry'), manifest('frozen-final-r5')
changes = [{'path': p, 'entrySha256': entry.get(p), 'finalSha256': frozen.get(p)}
           for p in sorted(entry.keys() | frozen.keys()) if entry.get(p) != frozen.get(p)]
write('implementation-change-manifest.json', {
    'generatedAt': now, 'entrySource': hashlib.sha256((base/'entry/source-sha256.txt').read_bytes()).hexdigest(),
    'finalSource': identity['sourceManifestSha256'], 'changedFiles': len(changes), 'changes': changes,
    'note': 'Byte comparison against the preserved dirty Phase4 entry. Existing unchanged dirty work is retained; this is not a Git HEAD diff.'})

record = json.loads((base / 'final-r5-api.json').read_text())
assert record['exitCode'] == 0
log = (base / 'final-r5-api.log').read_text()
passed = dict(re.findall(r'✓ (src/[^\n]+?\.spec\.ts) \((\d+) tests?\)', log))
assert len(passed) == 81, len(passed)
files = []
for name, count in sorted(passed.items()):
    p = root / 'apps/api' / name
    assert sha(p) == frozen[str(p.relative_to(root))]
    cases = re.findall(r"\bit\(\s*(['\"])(.*?)\1\s*,", p.read_text(), re.S)
    files.append({**artifact(p), 'passedTests': int(count), 'declaredCaseNames': [c[1] for c in cases]})
write('chaos-recovery-rehearsal-index.json', {
    'generatedAt': now, 'source': identity['sourceManifestSha256'],
    'evidenceClass': 'synthetic actual-service/repository assertions; controlled providers/transports',
    'execution': record, 'rawLog': artifact(base/'final-r5-api.log'), 'executedFiles': files,
    'criticalRepeatedPaths': {
        'quality': 'petros-phase5-quality: two owners/two tenants, current source/citation/pack/loop authority',
        'durableRecovery': 'petros-phase5-recovery: concurrent admission, ignored cancellation, receipt failure, expired claims and revoked portal authority repeated for both owners/tenants',
        'gatewayAccounting': 'petros-phase5-gateway: zero dispatch after drift, settled-but-denied disabled reply, exact rollback and concurrent two-tenant reservations; four controlled dispatches, 28 synthetic cost micros',
        'privacy': 'petros-phase5-pilot/operations: foreign owner/tenant and revocation denials; minimal immutable events and aggregate-only privileged projection'},
    'releaseRollback': {
        'ownerTest': 'apps/api/src/modules/integrations/petros-phase5-release.integration.spec.ts',
        'evidence': 'Seven passed cases: import/register/activation; negative gates; configuration drift; routing-owner changes; audit rollback; immutable disable and exact evaluated rollback; migration replay.',
        'migrationRehearsal': 'On disposable PostgreSQL only: drop explicit task-owned 0230 functions/tables without CASCADE, reapply 0230 and zzz_grants, compare FORCE RLS/policies/SELECT+INSERT-only grants/no PUBLIC execution. Full checked-in journal and prior Phase migration closure also executed.',
        'operationalRollback': 'Actual routing activation of the exact recorded evaluated rollback; disabled candidate denied; report, bundle and historical evidence preserved. Current config/identity/expiry remains required.',
        'destructiveRollback': 'Disposable DDL replay is not a production data downgrade, backup restore rehearsal or deployment authorization.'},
    'limits': ['No paid provider/network or real message delivery.', 'No production incident, production restore, partner certification or educator approval.', 'Lease crash/restart cases use actual persisted claims, expiry injection and a higher execution fence; no host-clock alteration or physical host restart.', 'Browser storage/connectivity checks are separate final reports; Firefox journey remains blocked.']})

reviewed = {
    'chromium': ['browser-super-admin-operations-desktop.png', 'browser-super-admin-operations-mobile.png',
                 'browser-text-enlargement.png', 'browser-continuity-memory-mobile.png'],
    'webkit': ['browser-super-admin-operations-mobile.png', 'browser-held-out-combined-viewport.png',
               'browser-teacher-correction-reviewed.png', 'browser-continuity-offline-sync.png']}
write('browser-visual-review.json', {
    'reviewedAt': now, 'source': identity['sourceManifestSha256'], 'reviewer': 'primary engineering agent, visual image inspection',
    'screenshots': {engine: [artifact(base/'browser'/engine/name) for name in names] for engine,names in reviewed.items()},
    'observations': ['Styled student, teacher and operator surfaces are present.',
        'Reviewed operator mobile/desktop pages show aggregate counts, unconfigured release and disabled admissions without private learner text or identifiers.',
        'Reviewed mobile memory page retains labelled correction/forgetting controls, privacy boundary notice and connectivity settings.',
        'Reviewed recovered note is visible with a reconciliation receipt; model state has text/unit alternatives.',
        'Reviewed enlarged-text and held-out composition pages preserve readable controls and scene labels. Automated keyboard/focus and overflow assertions are in each browser report.'],
    'limits': ['Software screenshots and assertions only; not a qualified human accessibility review.',
        'Controlled root-font enlargement is distinct from native browser-chrome zoom.',
        'Physical devices, actual screen readers/assistive technologies and real voice acceptance pending.',
        'Firefox151 build1532 cannot launch on this host; P5-E9/E10 full browser matrix remains blocked.']})
print(json.dumps({'changedFiles': len(changes), 'apiFiles': len(files), 'apiTests': sum(map(int, passed.values())), 'visualScreenshots': sum(map(len, reviewed.values()))}))
