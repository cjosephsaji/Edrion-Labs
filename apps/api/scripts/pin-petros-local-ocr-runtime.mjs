/* Pin an already provisioned local runtime. No package installation or shell hooks. */
import { readFile, realpath, readdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';

const [prefixArg, outputArg, packageVersion] = process.argv.slice(2);
if (!prefixArg || !outputArg || !/^[A-Za-z0-9_.+-]{1,64}$/.test(packageVersion ?? ''))
  throw Error('Usage: pin-petros-local-ocr-runtime.mjs PREFIX NEW_MANIFEST PACKAGE_VERSION');
const prefix = await realpath(prefixArg),
  output = resolve(outputArg);
const inside = (path) => {
  const part = relative(prefix, path);
  return part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};
const hash = async (path) => {
  const canonical = await realpath(path),
    info = await stat(canonical);
  if (!inside(canonical) || !info.isFile() || info.size > 100_000_000)
    throw Error('Runtime file escaped the prefix or exceeded the file limit');
  return createHash('sha256')
    .update(await readFile(canonical))
    .digest('hex');
};
const libraryRoot = await realpath(join(prefix, 'lib'));
const files = new Set();
for (const name of await readdir(libraryRoot))
  if (name.endsWith('.dylib')) files.add(await realpath(join(libraryRoot, name)));
if (!files.size || files.size > 256) throw Error('Runtime library count is invalid');
const libraries = [];
for (const path of [...files].sort())
  libraries.push({ path: relative(prefix, path), sha256: await hash(path) });
const manifest = {
  schemaVersion: 'petros.local-ocr-runtime.v1',
  prefix,
  packageVersion,
  executableSha256: await hash(join(prefix, 'bin/tesseract')),
  modelDataSha256: await hash(join(prefix, 'share/tessdata/eng.traineddata')),
  libraries,
};
const bytes = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
process.stdout.write(
  JSON.stringify({
    manifest: output,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    libraries: libraries.length,
  }) + '\n',
);
