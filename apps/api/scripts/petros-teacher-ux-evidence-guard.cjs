// Verification-only write redirection. Existing tests keep their assertions and fixture reads.
const fs = require('node:fs');
const path = require('node:path');
const { syncBuiltinESMExports } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const output = process.env.PETROS_UX_EVIDENCE_OUTPUT;
if (
  !output ||
  !path
    .resolve(output)
    .startsWith(
      path.join(root, 'docs/verification/petros-v2/m3-teacher-ux-evidence') +
        path.sep,
    )
)
  throw new Error('UX_VERIFICATION_OUTPUT_REQUIRED');
const originalWrite = fs.writeFileSync,
  originalMkdir = fs.mkdirSync,
  originalAppend = fs.appendFileSync;
function redirect(file) {
  if (
    typeof file !== 'string' &&
    !(file instanceof URL) &&
    !Buffer.isBuffer(file)
  )
    return file;
  const target = path.resolve(
    file instanceof URL
      ? require('node:url').fileURLToPath(file)
      : String(file),
  );
  const protectedRoot = path.join(root, 'docs/verification') + path.sep;
  if (
    target.startsWith(protectedRoot) &&
    !target.startsWith(
      path.join(root, 'docs/verification/petros-v2/m3-teacher-ux-evidence') +
        path.sep,
    )
  ) {
    const moved = path.join(output, 'generated', path.relative(root, target));
    originalMkdir(path.dirname(moved), { recursive: true });
    originalAppend(
      path.join(output, 'redirected-writes.jsonl'),
      JSON.stringify({
        from: path.relative(root, target),
        to: path.relative(root, moved),
      }) + '\n',
    );
    return moved;
  }
  return file;
}
fs.writeFileSync = function (file, ...args) {
  return originalWrite.call(this, redirect(file), ...args);
};
const originalAsync = fs.writeFile;
fs.writeFile = function (file, ...args) {
  return originalAsync.call(this, redirect(file), ...args);
};
for (const name of ['unlinkSync', 'rmSync', 'rmdirSync', 'renameSync']) {
  const original = fs[name];
  fs[name] = function (file, ...args) {
    const target = typeof file === 'string' ? path.resolve(file) : '';
    if (
      target.startsWith(path.join(root, 'docs/verification') + path.sep) &&
      !target.startsWith(path.resolve(output) + path.sep)
    )
      throw new Error('HISTORICAL_EVIDENCE_DELETION_REFUSED');
    return original.call(this, file, ...args);
  };
}
syncBuiltinESMExports();
