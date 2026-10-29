import { readFile, realpath, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { sha256 } from './adapters/content-adapter';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z
  .object({
    schemaVersion: z.literal('petros.local-ocr-runtime.v1'),
    prefix: z.string().max(1024).refine(isAbsolute),
    packageVersion: z.string().regex(/^[A-Za-z0-9_.+-]{1,64}$/),
    executableSha256: hash,
    modelDataSha256: hash,
    libraries: z
      .array(
        z
          .object({
            path: z
              .string()
              .max(256)
              .regex(/^lib\/[A-Za-z0-9_./+-]+\.dylib$/)
              .refine((p) => !p.split('/').includes('..')),
            sha256: hash,
          })
          .strict(),
      )
      .min(1)
      .max(256),
  })
  .strict();

async function boundedFile(path: string, maxBytes: number) {
  const info = await stat(path);
  if (!info.isFile() || info.size > maxBytes) throw new Error('M2_OCR_RUNTIME_FILE_LIMIT');
  return readFile(path);
}

function contained(root: string, path: string) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

/** Explicit administrator-owned deployment configuration, never a document/cue input.
 * Engine, English data and all private dylibs are pinned before each dispatch.
 * This enables an isolated local prefix without allowing a PATH-selected command. */
export async function resolvePinnedOcrRuntime(path: string, expectedManifestSha256: string) {
  if (!isAbsolute(path) || !hash.safeParse(expectedManifestSha256).success)
    throw new Error('M2_OCR_RUNTIME_PIN_REQUIRED');
  const bytes = await boundedFile(path, 100_000);
  if (sha256(bytes) !== expectedManifestSha256) throw new Error('M2_OCR_RUNTIME_MANIFEST_HASH');
  const manifest = manifestSchema.parse(JSON.parse(bytes.toString('utf8')));
  const prefix = await realpath(manifest.prefix);
  const executable = await realpath(join(prefix, 'bin/tesseract'));
  const data = await realpath(join(prefix, 'share/tessdata'));
  const model = await realpath(join(data, 'eng.traineddata'));
  const libraries = await realpath(join(prefix, 'lib'));
  if (
    prefix === sep ||
    !contained(prefix, executable) ||
    !contained(prefix, data) ||
    !contained(data, model) ||
    !contained(prefix, libraries)
  )
    throw new Error('M2_OCR_RUNTIME_PATH_ESCAPE');
  const executableSha256 = sha256(await boundedFile(executable, 100_000_000));
  const modelDataSha256 = sha256(await boundedFile(model, 100_000_000));
  if (
    executableSha256 !== manifest.executableSha256 ||
    modelDataSha256 !== manifest.modelDataSha256
  )
    throw new Error('M2_OCR_RUNTIME_ASSET_HASH');
  const pinned = new Map<string, string>();
  for (const entry of manifest.libraries) {
    const file = await realpath(join(prefix, entry.path));
    if (!contained(libraries, file) || pinned.has(file))
      throw new Error('M2_OCR_RUNTIME_LIBRARY_PATH');
    if (sha256(await boundedFile(file, 100_000_000)) !== entry.sha256)
      throw new Error('M2_OCR_RUNTIME_LIBRARY_HASH');
    pinned.set(file, entry.sha256);
  }
  // A newly added private library cannot silently become executable input.
  for (const entry of await readdir(libraries)) {
    if (!entry.endsWith('.dylib')) continue;
    const file = await realpath(join(libraries, entry));
    if (!pinned.has(file)) throw new Error('M2_OCR_RUNTIME_UNPINNED_LIBRARY');
  }
  return {
    executable,
    data,
    libraryRoots: [] as string[],
    libraryFiles: [...pinned.keys()],
    version: `tesseract.binary.${executableSha256.slice(0, 20)}.eng.${modelDataSha256.slice(0, 16)}`,
    runtime: {
      executableSha256,
      modelDataSha256,
      packageVersion: manifest.packageVersion,
      modelData: 'eng.traineddata' as const,
      segmentationMode: 11 as const,
    },
  };
}
