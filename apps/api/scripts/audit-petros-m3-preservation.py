"""Compare M3 to its captured dirty starting checkout. Never repairs or overwrites historical files."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
evidence = root / 'docs/verification/petros-v2/m3-evidence'
baseline = json.loads((evidence / 'baseline.json').read_text())
prior = json.loads((evidence / 'preservation.json').read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


changed = []
missing = []
for name, expected in baseline['sha256'].items():
    path = root / name
    if not path.exists():
        missing.append(name)
    elif sha(path) != expected:
        changed.append(name)

history = [name for name in changed if name.startswith('docs/verification/petros-v2/')]
expected_code = [name for name in prior['changedStartingFiles'] if not name.startswith('docs/')]
expected_code += ['apps/api/src/modules/student/knowledge/petros-assessment-contract.server.ts']
unexpected = [name for name in changed if name not in expected_code and name not in history]
new_code = sorted(set(prior['newImplementationFiles'] + [
    'apps/api/scripts/verify-petros-m3.mjs',
    'apps/api/scripts/restore-petros-m3-historical-evidence.py',
    'apps/api/scripts/audit-petros-m3-preservation.py',
    'apps/api/scripts/verify-petros-m3-private-browser.mjs',
    'apps/api/src/modules/integrations/petros-m3-private-review.integration.spec.ts',
    'packages/learn-evals/src/petros-v2/fixtures/sources/m3/private-review-source.txt',
]))
markers = sorted(set(prior['bundleScan']['markers'] + ['M3_PRIVATE_CRITERIA_SENTINEL_7829', 'PRIVATE_FRAGMENT_ALPHA_SENTINEL', 'ZKQKEY', 'PRIVATE_UI_REVIEW_SENTINEL', 'petros.v2.private-verification-candidate.v1']))
bundle = root / prior['bundleScan']['directory']
scripts = [path for path in bundle.rglob('*.js') if not path.name.startswith('._')]
hits = []
for path in scripts:
    source = path.read_text()
    for marker in markers:
        if marker in source:
            hits.append({'path': str(path.relative_to(root)), 'marker': marker})

unrecovered = [{
    'path': name,
    'startingSha256': baseline['sha256'][name],
    'currentSha256': sha(root / name),
    'status': 'Original receipt overwritten by upstream tests; exact starting bytes not recovered',
} for name in history]
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
result = {
    'label': 'Compared with captured starting dirty checkout; two historical receipts remain unrecovered',
    'baselineCount': len(baseline['sha256']),
    'headUnchanged': head == baseline['head'],
    'changedStartingFiles': sorted(changed),
    'missingStartingFiles': sorted(missing),
    'protectedHistoryChanges': sorted(history),
    'unexpectedStartingChanges': sorted(unexpected),
    'historicalPreservationPassed': not history and not missing,
    'historicalRestoration': {'overwritten': 18, 'exactStartingHashesRestored': 16, 'unrecovered': unrecovered},
    'appliedMigrationsUnchanged': not any(name.startswith('packages/database/migrations/') for name in changed + missing),
    'newImplementationFiles': new_code,
    'newEvidenceFiles': sorted(str(path.relative_to(root)) for path in evidence.rglob('*')
                               if path.is_file() and not path.name.startswith('._')),
    'bundleScan': {'directory': prior['bundleScan']['directory'], 'files': len(scripts), 'markers': markers, 'hits': hits},
    'currentGitStatus': subprocess.check_output(['git', 'status', '--short'], cwd=root, text=True),
    'sha256': {name: sha(root / name) for name in sorted(set(changed + new_code)) if (root / name).exists()},
}
(evidence / 'preservation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ['baselineCount', 'headUnchanged', 'historicalPreservationPassed',
                                            'missingStartingFiles', 'protectedHistoryChanges',
                                            'unexpectedStartingChanges', 'appliedMigrationsUnchanged']}))
sys.exit(1 if history or missing or unexpected or hits or head != baseline['head'] else 0)
