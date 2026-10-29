/** Bounded orthogonal visibility-grid routing. All geometry is presentation-only;
 * semantic endpoints and saved student coordinates remain owned by the reducer. */
export type Point = { x: number; y: number };
export type PortSide = 'top' | 'bottom' | 'left' | 'right';
export type RoutingNode = Point & { id: string };
export type RoutingEdge = { id: string; from: string; to: string };
export type Rect = Point & { width: number; height: number };
export type Route = { points: Point[]; path: string; label: Point; labelAnchor: Point; fromPort: PortSide; toPort: PortSide };
export const NODE_WIDTH = 172, NODE_HEIGHT = 68, LABEL_WIDTH = 126, LABEL_HEIGHT = 32;
const CLEAR = 20, LANE = 38;
const sides: PortSide[] = ['top', 'bottom', 'left', 'right'];
const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const nodeRect = (n: RoutingNode, gap = 0): Rect => ({ x: n.x - NODE_WIDTH / 2 - gap, y: n.y - NODE_HEIGHT / 2 - gap, width: NODE_WIDTH + 2 * gap, height: NODE_HEIGHT + 2 * gap });
const inside = (p: Point, r: Rect) => p.x > r.x + .01 && p.x < r.x + r.width - .01 && p.y > r.y + .01 && p.y < r.y + r.height - .01;
export function segmentHitsRect(a: Point, b: Point, r: Rect) {
  return a.y === b.y ? a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width
    : a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export function connectionPort(n: Point, side: PortSide, offset = 0, gap = 5): Point {
  return side === 'top' || side === 'bottom' ? { x: n.x + offset, y: n.y + (side === 'top' ? -1 : 1) * (NODE_HEIGHT / 2 + gap) }
    : { x: n.x + (side === 'left' ? -1 : 1) * (NODE_WIDTH / 2 + gap), y: n.y + offset };
}
function simplify(points: Point[]) {
  return points.filter((p, i) => !i || i === points.length - 1 || !((points[i - 1]!.x === p.x && points[i + 1]!.x === p.x) || (points[i - 1]!.y === p.y && points[i + 1]!.y === p.y)));
}
export function roundedPath(raw: Point[]) {
  const points = simplify(raw); if (!points.length) return '';
  let path = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, b = points[i]!, c = points[i + 1]!, radius = Math.min(9, length(a, b) / 2, length(b, c) / 2);
    const before = { x: b.x + Math.sign(a.x - b.x) * radius, y: b.y + Math.sign(a.y - b.y) * radius };
    const after = { x: b.x + Math.sign(c.x - b.x) * radius, y: b.y + Math.sign(c.y - b.y) * radius };
    path += ` L${before.x},${before.y} Q${b.x},${b.y} ${after.x},${after.y}`;
  }
  const last = points.at(-1)!; return `${path} L${last.x},${last.y}`;
}
// Tiny heap keeps routing responsive during pointer previews without a new dependency.
class Queue {
  items: Array<{ id: number; cost: number }> = [];
  push(item: { id: number; cost: number }) { const a = this.items; a.push(item); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p]!.cost <= item.cost) break; a[i] = a[p]!; i = p; } a[i] = item; }
  pop() { const a = this.items, first = a[0]!, last = a.pop()!; if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1]!.cost < a[c]!.cost) c++; if (a[c]!.cost >= last.cost) break; a[i] = a[c]!; i = c; } a[i] = last; } return first; }
}
function linePenalty(a: Point, b: Point, routes: Route[]) {
  let penalty = 0;
  for (const route of routes) for (let i = 1; i < route.points.length; i++) {
    const c = route.points[i - 1]!, d = route.points[i]!;
    const ah = a.y === b.y, ch = c.y === d.y;
    if (ah === ch) {
      const distance = ah ? Math.abs(a.y - c.y) : Math.abs(a.x - c.x);
      const overlap = ah ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
        : Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
      if (overlap > 0 && distance < LANE) penalty += overlap * (distance < 2 ? 120 : (LANE - distance) / 4);
    } else {
      const h1 = ah ? a : c, h2 = ah ? b : d, v1 = ah ? c : a, v2 = ah ? d : b;
      if (v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y)) penalty += 140;
    }
  }
  return penalty;
}
function labelFor(points: Point[], nodes: RoutingNode[], routes: Route[]) {
  const obstacles = [...nodes.map(n => nodeRect(n, 10)), ...routes.map(r => ({ ...r.label, width: LABEL_WIDTH, height: LABEL_HEIGHT }))];
  const choices: Array<{ label: Point; anchor: Point; score: number }> = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, horizontal = a.y === b.y;
    for (const t of [.5, .35, .65]) for (const gap of [6, 18, 38, 58, 82]) for (const sign of [-1, 1]) {
      const anchor = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const label = horizontal ? { x: anchor.x - LABEL_WIDTH / 2, y: anchor.y + (sign < 0 ? -LABEL_HEIGHT - gap : gap) }
        : { x: anchor.x + (sign < 0 ? -LABEL_WIDTH - gap : gap), y: anchor.y - LABEL_HEIGHT / 2 };
      const box = { x: label.x - 3, y: label.y - 3, width: LABEL_WIDTH + 6, height: LABEL_HEIGHT + 6 };
      if (obstacles.some(r => overlaps(box, r)) || [...routes.map(r => r.points), points].some(ps => ps.some((p, j) => j && segmentHitsRect(ps[j - 1]!, p, box)))) continue;
      choices.push({ label, anchor, score: gap + (horizontal ? 0 : 25) + Math.abs(t - .5) * 20 - Math.min(length(a, b), 400) / 30 });
    }
  }
  choices.sort((a, b) => a.score - b.score);
  // The exterior grid always supplies an unobstructed corridor for sparse diagrams.
  return choices[0] ?? { label: { x: points[0]!.x - LABEL_WIDTH / 2, y: Math.min(...nodes.map(n => n.y)) - NODE_HEIGHT / 2 - 140 - routes.length * LANE }, anchor: points[0]! };
}
export function routeDiagram(nodes: RoutingNode[], edges: RoutingEdge[], portPreferences?: ReadonlyMap<string, { from: PortSide; to: PortSide }>): Map<string, Route> {
  const result = new Map<string, Route>(); if (!nodes.length) return result;
  const obstacles = nodes.map(n => nodeRect(n, CLEAR));
  const minX = Math.min(...obstacles.map(r => r.x)), maxX = Math.max(...obstacles.map(r => r.x + r.width));
  const minY = Math.min(...obstacles.map(r => r.y)), maxY = Math.max(...obstacles.map(r => r.y + r.height));
  for (const edge of edges) {
    const from = nodes.find(n => n.id === edge.from), to = nodes.find(n => n.id === edge.to); if (!from || !to) continue;
    const routes = [...result.values()];
    const siblings = edges.filter(e => e.from === edge.from && e.to === edge.to || e.to === edge.from && e.from === edge.to);
    const rank = siblings.findIndex(e => e.id === edge.id);
    const horizontal = Math.abs(from.x - to.x) > Math.abs(from.y - to.y);
    const direct: PortSide[] = horizontal ? [from.x < to.x ? 'right' : 'left', from.x < to.x ? 'left' : 'right'] : [from.y < to.y ? 'bottom' : 'top', from.y < to.y ? 'top' : 'bottom'];
    const preference = portPreferences?.get(edge.id);
    const preferred = preference ? [preference.from, preference.to] : rank % 3 === 0 ? direct : horizontal ? [rank % 3 === 1 ? 'top' : 'bottom', rank % 3 === 1 ? 'top' : 'bottom'] : [rank % 3 === 1 ? 'left' : 'right', rank % 3 === 1 ? 'left' : 'right'];
    const portPenalty = preference ? 100000 : 500;
    const ports = (node: RoutingNode) => sides.map(side => {
      const incident = edges.filter(e => e.from === node.id || e.to === node.id), slot = incident.findIndex(e => e.id === edge.id);
      const span = side === 'top' || side === 'bottom' ? NODE_WIDTH - 44 : NODE_HEIGHT - 24;
      const offset = incident.length <= 1 ? 0 : (slot / (incident.length - 1) - .5) * span;
      return { side, tip: connectionPort(node, side, offset), stub: connectionPort(node, side, offset, CLEAR + 2) };
    });
    const starts = ports(from), ends = ports(to);
    const xs = new Set<number>([...starts, ...ends].map(p => p.stub.x)), ys = new Set<number>([...starts, ...ends].map(p => p.stub.y));
    for (const r of obstacles) { xs.add(r.x); xs.add(r.x + r.width); ys.add(r.y); ys.add(r.y + r.height); }
    for (let i = 1; i <= Math.min(edges.length + 1, 10); i++) { xs.add(minX - LANE * i); xs.add(maxX + LANE * i); ys.add(minY - LANE * i); ys.add(maxY + LANE * i); }
    const labels = routes.map(r => ({ x: r.label.x - 8, y: r.label.y - 8, width: LABEL_WIDTH + 16, height: LABEL_HEIGHT + 16 }));
    for (const r of labels) { xs.add(r.x); xs.add(r.x + r.width); ys.add(r.y); ys.add(r.y + r.height); }
    for (const r of routes) for (const p of r.points) { xs.add(p.x - LANE); xs.add(p.x + LANE); ys.add(p.y - LANE); ys.add(p.y + LANE); }
    const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b), nx = X.length, count = nx * Y.length;
    const point = (id: number) => ({ x: X[id % nx]!, y: Y[Math.floor(id / nx)]! });
    const cell = (p: Point) => Y.indexOf(p.y) * nx + X.indexOf(p.x);
    const valid = Array.from({ length: count }, (_, id) => !obstacles.some(r => inside(point(id), r)));
    const costs = new Float64Array(count * 2).fill(Infinity), previous = new Int32Array(count * 2).fill(-1), owners = new Int8Array(count * 2).fill(-1), queue = new Queue();
    starts.forEach((p, i) => { if (!valid[cell(p.stub)]) return; const id = cell(p.stub) * 2 + (p.side === 'top' || p.side === 'bottom' ? 1 : 0), cost = p.side === preferred[0] ? 0 : portPenalty; costs[id] = cost; owners[id] = i; queue.push({ id, cost }); });
    let winner = -1, endPort = -1, best = Infinity;
    while (queue.items.length) {
      const { id, cost } = queue.pop(); if (cost !== costs[id] || cost > best) continue;
      const c = id >> 1, a = point(c), x = c % nx, y = Math.floor(c / nx);
      ends.forEach((p, i) => { if (cell(p.stub) !== c) return; const total = cost + (p.side === preferred[1] ? 0 : portPenalty); if (total < best) { best = total; winner = id; endPort = i; } });
      for (const next of [x > 0 ? c - 1 : -1, x < nx - 1 ? c + 1 : -1, y > 0 ? c - nx : -1, y < Y.length - 1 ? c + nx : -1]) {
        if (next < 0 || !valid[next]) continue;
        const b = point(next); if (obstacles.some(r => segmentHitsRect(a, b, r))) continue;
        const dir = a.x === b.x ? 1 : 0, nextId = next * 2 + dir;
        const labelCost = labels.some(r => segmentHitsRect(a, b, r)) ? 8000 : 0;
        const total = cost + length(a, b) + (dir !== (id & 1) ? 24 : 0) + linePenalty(a, b, routes) + labelCost;
        if (total >= costs[nextId]!) continue;
        costs[nextId] = total; previous[nextId] = id; owners[nextId] = owners[id]!; queue.push({ id: nextId, cost: total });
      }
    }
    if (winner < 0) { // Overlapping node rectangles: keep direction explicit via the outer corridor.
      const a = starts[0]!, b = ends[0]!, y = minY - LANE * (rank + 1), points = [a.tip, a.stub, { x: a.stub.x, y }, { x: b.stub.x, y }, b.stub, b.tip];
      const label = labelFor(points, nodes, routes); result.set(edge.id, { points, path: roundedPath(points), label: label.label, labelAnchor: label.anchor, fromPort: a.side, toPort: b.side }); continue;
    }
    const chain: Point[] = []; let id = winner; while (id >= 0) { chain.push(point(id >> 1)); id = previous[id]!; }
    const a = starts[owners[winner]!]!, b = ends[endPort]!, points = simplify([a.tip, ...chain.reverse(), b.tip]);
    const label = labelFor(points, nodes, routes);
    result.set(edge.id, { points, path: roundedPath(points), label: label.label, labelAnchor: label.anchor, fromPort: a.side, toPort: b.side });
  }
  return result;
}
export function fittedDiagramView(nodes: RoutingNode[], routes: Route[], size: { width: number; height: number }) {
  const points = [...nodes.flatMap(n => [{ x: n.x - NODE_WIDTH / 2 - 28, y: n.y - NODE_HEIGHT / 2 - 32 }, { x: n.x + NODE_WIDTH / 2 + 28, y: n.y + NODE_HEIGHT / 2 + 32 }]),
    ...routes.flatMap(r => [...r.points, { x: r.label.x - 10, y: r.label.y - 10 }, { x: r.label.x + LABEL_WIDTH + 10, y: r.label.y + LABEL_HEIGHT + 10 }])];
  if (!points.length) return { x: 0, y: 0, width: 600, height: 320 };
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  const width = Math.max(...points.map(p => p.x)) - x + 24, height = Math.max(...points.map(p => p.y)) - y + 24;
  const scale = Math.min(1.45, size.width / Math.max(280, width), size.height / Math.max(150, height));
  const vw = size.width / scale, vh = size.height / scale;
  return { x: x + (width - 24) / 2 - vw / 2, y: y + (height - 24) / 2 - vh / 2, width: vw, height: vh };
}
