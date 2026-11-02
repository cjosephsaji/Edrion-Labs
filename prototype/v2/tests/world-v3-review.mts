import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../evidence/world-rebuild/', import.meta.url),
  after = new URL('after/', root);
await mkdir(new URL('crops/', root), { recursive: true });
const topics = [
  'opening',
  'neural',
  'rocket',
  'attention',
  'traffic',
  'relativity',
];
for (const width of [1440, 390]) {
  const thumbs = await Promise.all(
    topics.map(async (name, i) => ({
      input: await sharp(
        fileURLToPath(new URL(`${name}-${width}-dpr2.png`, after)),
      )
        .resize({ width: width === 1440 ? 720 : 260 })
        .png()
        .toBuffer(),
      left: (i % 3) * (width === 1440 ? 720 : 260),
      top: Math.floor(i / 3) * (width === 1440 ? 450 : 563),
    })),
  );
  await sharp({
    create: {
      width: width === 1440 ? 2160 : 780,
      height: width === 1440 ? 900 : 1126,
      channels: 3,
      background: '#e9dfc9',
    },
  })
    .composite(thumbs)
    .png()
    .toFile(fileURLToPath(new URL(`contact-${width}.png`, root)));
}
// Native pixel crops: no enlargement or smoothing of the screenshots.
for (const [file, name, left, top, width, height] of [
  ['neural-1440-dpr2.png', 'sdf-numerals', 1000, 530, 1000, 500],
  ['rocket-1440-dpr2.png', 'rocket-edge', 1330, 140, 420, 680],
  ['speaking-neural-1440-dpr2.png', 'petros-speaking', 510, 480, 620, 740],
  ['attention-1440-dpr2.png', 'word-type', 1150, 380, 800, 400],
  ['traffic-1440-dpr2.png', 'cars-ribbon', 1210, 720, 920, 460],
] as const) {
  await sharp(fileURLToPath(new URL(file, after)))
    .extract({ left, top, width, height })
    .png()
    .toFile(fileURLToPath(new URL(`crops/${name}-native.png`, root)));
}
