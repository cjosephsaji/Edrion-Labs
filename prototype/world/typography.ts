/** next/font registers an internal self-hosted family name, not the literal word “Outfit”. */
export function worldTypeface() {
  const root = document.querySelector('[data-world-typeface]');
  return getComputedStyle(root ?? document.body).fontFamily;
}
export async function prepareWorldTypeface() {
  const family = worldTypeface();
  await Promise.all([
    document.fonts.load(`400 32px ${family}`),
    document.fonts.load(`500 32px ${family}`),
    document.fonts.load(`600 32px ${family}`),
  ]);
  await document.fonts.ready;
  return family;
}
