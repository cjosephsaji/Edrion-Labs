'use strict';
// Decode and crop only inside the existing image-capable OS sandbox.
const { createHash } = require('node:crypto');
const chunks = [];
let size = 0;
process.stdin.on('data', (b) => {
  size += b.length;
  if (size > 3_000_000) process.exit(1);
  chunks.push(b);
});
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString()),
      runtime = JSON.parse(process.argv[4]);
    const { createCanvas, loadImage } = require(runtime.canvas),
      bytes = Buffer.from(input.data, 'base64');
    // Bounds before native decoding, including JPEG SOF dimensions.
    let w, h;
    if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      w = bytes.readUInt32BE(16);
      h = bytes.readUInt32BE(20);
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      let at = 2;
      while (at + 8 < bytes.length) {
        if (bytes[at++] !== 255) throw new Error();
        const marker = bytes[at++];
        if (marker === 0xd9 || marker === 0xda) break;
        const n = bytes.readUInt16BE(at);
        if (n < 2 || at + n > bytes.length) throw new Error();
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          h = bytes.readUInt16BE(at + 3);
          w = bytes.readUInt16BE(at + 5);
          break;
        }
        at += n;
      }
    }
    if (!w || !h || w * h > 16_000_000 || w > 16000 || h > 16000) throw new Error();
    const image = await loadImage(bytes),
      r = input.region;
    if (
      !r ||
      Object.values(r).some((v) => !Number.isFinite(v)) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > 1.00000001 ||
      r.y + r.height > 1.00000001
    )
      throw new Error();
    const x = Math.floor(r.x * w),
      y = Math.floor(r.y * h),
      cw = Math.min(w - x, Math.ceil(r.width * w)),
      ch = Math.min(h - y, Math.ceil(r.height * h));
    const scale = Math.min(1, 1280 / cw, 1280 / ch),
      canvas = createCanvas(
        Math.max(1, Math.round(cw * scale)),
        Math.max(1, Math.round(ch * scale)),
      );
    canvas.getContext('2d').drawImage(image, x, y, cw, ch, 0, 0, canvas.width, canvas.height);
    const png = canvas.toBuffer('image/png');
    if (png.length > 1_000_000) throw new Error();
    process.stdout.write(
      JSON.stringify({
        result: {
          data: png.toString('base64'),
          hash: createHash('sha256').update(png).digest('hex'),
          width: canvas.width,
          height: canvas.height,
          pixels: { x, y, width: cw, height: ch },
        },
      }) + '\n',
    );
  } catch {
    process.stdout.write(JSON.stringify({ error: 'PETROS_M2_CROP_UNSUPPORTED' }) + '\n');
    process.exitCode = 1;
  }
});
