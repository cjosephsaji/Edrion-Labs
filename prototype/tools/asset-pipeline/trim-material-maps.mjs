// Preserve 2K albedo; use 1K normal/packed data maps to reduce browser residency.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../assets/realism');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
const register = JSON.parse(
  await readFile(root + '/asset-register.json', 'utf8'),
);
for (const row of register) {
  if (
    !row.runtimeFormat.startsWith('GLB') ||
    row.id.startsWith('classroom') ||
    row.id === 'teaching-board'
  )
    continue;
  const file = root + '/runtime/' + row.id + '.glb',
    doc = await io.read(file);
  const color = new Set(
    doc
      .getRoot()
      .listMaterials()
      .flatMap((m) => [m.getBaseColorTexture(), m.getEmissiveTexture()])
      .filter(Boolean),
  );
  for (const t of doc.getRoot().listTextures())
    if (!color.has(t) && t.getSize().some((n) => n > 1024))
      t.setImage(
        await sharp(t.getImage())
          .resize({ width: 1024, height: 1024, fit: 'inside' })
          .webp({ quality: 88 })
          .toBuffer(),
      );
  await io.write(file, doc);
  row.textures = doc
    .getRoot()
    .listTextures()
    .map((t) => ({
      name: t.getName(),
      mime: t.getMimeType(),
      size: t.getSize(),
    }));
  row.bytes = (await stat(file)).size;
}
await writeFile(
  root + '/asset-register.json',
  JSON.stringify(register, null, 2) + '\n',
);
