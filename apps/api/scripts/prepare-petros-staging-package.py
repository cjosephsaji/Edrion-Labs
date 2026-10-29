#!/usr/bin/env python3
"""Freeze current API/workspace sources; apply only proposal DB files in a private tree.

No environment loading, database access, dependency installation or deployment.
The historical 32-file patch remains intact. Application code is already applied.
"""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
DOSSIER = ROOT / 'docs/verification/petros-v2'
DB_INCLUDE = ['--include=packages/database/migrations/*',
              '--include=packages/database/migrations/sql/*',
              '--include=packages/database/migrations/meta/*']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(destination):
    destination = pathlib.Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('Package destination must be outside the checkout')
    destination.mkdir(parents=True, exist_ok=False)
    source = destination / 'source'
    source.mkdir()
    selected = ['apps/api/src', 'apps/api/scripts', 'apps/api/test', 'packages', 'tooling']
    excluded = {'node_modules', 'dist', '.turbo', '.next', '__pycache__'}
    for name in selected:
        base = ROOT / name
        for path in sorted(base.rglob('*')):
            relative = path.relative_to(ROOT)
            if (not path.is_file() or path.is_symlink()
                    or excluded.intersection(relative.parts)
                    or any(p.startswith('._') for p in relative.parts)
                    or path.name.startswith('.env')):
                continue
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
    for name in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc',
                 '.nvmrc', 'turbo.json', 'apps/api/package.json',
                 'apps/api/tsconfig.json', 'apps/api/tsconfig.build.json',
                 'apps/api/vitest.config.ts', 'apps/api/vitest.setup.ts']:
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    # Never apply the application hunks over the already-integrated Phase B sources.
    subprocess.run(['git', 'apply', '--check', *DB_INCLUDE,
                    str(DOSSIER / 'proposed-production.diff')], cwd=source, check=True)
    subprocess.run(['git', 'apply', *DB_INCLUDE,
                    str(DOSSIER / 'proposed-production.diff')], cwd=source, check=True)
    proposal = json.loads((DOSSIER / 'proposed-production-files.json').read_text())
    if len(proposal) != 32:
        raise ValueError('Original deployment proposal inventory drifted')
    final_proposal = proposal + [{'path': p} for p in [
        'apps/api/src/modules/petros-topic-profiles/petros-topic-profiles.service.ts',
        '.nvmrc', 'package.json', 'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/src/main.ts',
        'apps/api/scripts/copy-build-assets.mjs', 'apps/api/scripts/start-built.cjs',
    ]]
    deployment = [{'path': p['path'], 'sha256': sha(source / p['path']),
                   'proposalOnly': p['path'].startswith('packages/database/migrations/')}
                  for p in final_proposal]
    for name in ['proposed-production.diff', 'proposed-production-files.json', 'staging.env.example',
                 'staging-migration.env.example', 'staging-runtime-fixes.diff', 'staging-operations.md',
                 'clean-build-operations.md', 'clean-build-fixes.diff']:
        if (DOSSIER / name).exists():
            shutil.copyfile(DOSSIER / name, destination / name)
    manifest = {'format': 1, 'baseHead': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'originalProposalSha256': sha(DOSSIER / 'proposed-production.diff'),
        'deploymentFiles': deployment,
        'bundleFiles': [{'path': p.name, 'sha256': sha(p)}
                        for p in sorted(destination.iterdir()) if p.is_file()],
        'sourceFiles': [{'path': str(p.relative_to(source)), 'sha256': sha(p)}
                        for p in sorted(source.rglob('*')) if p.is_file()]}
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return destination, manifest


def archive(destination):
    archive_path = destination.with_suffix('.tar.gz')
    with archive_path.open('wb') as output, gzip.GzipFile(fileobj=output, mode='wb', mtime=0, filename='') as gz:
        with tarfile.open(fileobj=gz, mode='w') as tar:
            for path in sorted(destination.rglob('*')):
                if not path.is_file():
                    continue
                info = tarfile.TarInfo(str(path.relative_to(destination)))
                info.size = path.stat().st_size
                info.mode = 0o644
                tar.addfile(info, io.BytesIO(path.read_bytes()))
    return {'archive': str(archive_path), 'sha256': sha(archive_path),
            'manifestSha256': sha(destination / 'manifest.json')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--destination', required=True)
    parser.add_argument('--archive', action='store_true')
    args = parser.parse_args()
    destination, manifest = build(args.destination)
    print(json.dumps(archive(destination) if args.archive else {
        'directory': str(destination), 'sourceFiles': len(manifest['sourceFiles']),
        'manifestSha256': sha(destination / 'manifest.json')}))
