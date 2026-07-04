/**
 * Server-side deterministic SVG charts (Petros Phase 5). NOT model-generated: deterministic, no
 * injection surface, zero token cost. The model picks WHICH chart; the server draws it. The same
 * markup is sanitized-inline in chat (`chart_svg` artifact) and inlined into Handlebars PDF
 * contexts. Design-token palette; no external fonts or scripts.
 */

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export interface ChartDatum {
  label: string;
  value: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function pieChartSvg(title: string, data: ChartDatum[]): string {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0) || 1;
  const cx = 130;
  const cy = 130;
  const r = 100;
  let angle = -Math.PI / 2;
  const slices: string[] = [];
  data.forEach((d, i) => {
    const frac = Math.max(0, d.value) / total;
    const sweep = frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    if (frac >= 0.9999) {
      slices.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[i % PALETTE.length]}" />`);
    } else if (frac > 0) {
      slices.push(
        `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${PALETTE[i % PALETTE.length]}" />`,
      );
    }
  });
  const legend = data
    .map(
      (d, i) =>
        `<g transform="translate(280, ${34 + i * 24})"><rect width="14" height="14" rx="3" fill="${PALETTE[i % PALETTE.length]}" /><text x="20" y="12" font-size="13">${esc(d.label)} — ${d.value} (${Math.round((Math.max(0, d.value) / total) * 100)}%)</text></g>`,
    )
    .join('');
  const height = Math.max(270, 40 + data.length * 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 ${height}" font-family="system-ui, sans-serif" role="img" aria-label="${esc(title)}">
<text x="10" y="20" font-size="15" font-weight="bold">${esc(title)}</text>
<g transform="translate(0, 20)">${slices.join('')}</g>${legend}</svg>`;
}

export function barChartSvg(title: string, data: ChartDatum[]): string {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 44;
  const gap = 26;
  const chartH = 200;
  const left = 46;
  const width = Math.max(360, left + data.length * (barW + gap) + 20);
  const bars = data
    .map((d, i) => {
      const h = Math.round((Math.max(0, d.value) / max) * chartH);
      const x = left + i * (barW + gap);
      const y = 40 + chartH - h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${PALETTE[i % PALETTE.length]}" />
<text x="${x + barW / 2}" y="${y - 6}" font-size="12" text-anchor="middle">${d.value}</text>
<text x="${x + barW / 2}" y="${40 + chartH + 18}" font-size="11" text-anchor="middle">${esc(d.label.slice(0, 12))}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${chartH + 80}" font-family="system-ui, sans-serif" role="img" aria-label="${esc(title)}">
<text x="10" y="20" font-size="15" font-weight="bold">${esc(title)}</text>
<line x1="${left - 6}" y1="${40 + chartH}" x2="${width - 10}" y2="${40 + chartH}" stroke="#999" />
${bars}</svg>`;
}
