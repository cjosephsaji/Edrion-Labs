import { valueOf, type VisualSpec, type ModelState } from './visual-spec';

/** Trusted display list, consumed by React/SVG and the room's canvas texture. */
export type Mark =
  | { kind: 'path'; id: string; d: string; fill: string; stroke: string; width: number }
  | {
      kind: 'ellipse';
      id: string;
      x: number;
      y: number;
      rx: number;
      ry: number;
      fill: string;
      stroke: string;
      width: number;
    }
  | {
      kind: 'text';
      id: string;
      x: number;
      y: number;
      text: string;
      color: string;
      size: number;
      anchor: 'start' | 'middle';
    };
export interface VisualScene {
  marks: Mark[];
  description: string;
  note: string;
}
const ink = '#294f43',
  gold = '#a86e26',
  green = '#537b63',
  blue = '#42778b';
export function visualScene(spec: VisualSpec, s: ModelState, test = false): VisualScene {
  const marks: Mark[] = [];
  const active = (id: string) => s.highlights.includes(id) || s.selected === id;
  const path = (id: string, d: string, fill = 'none', stroke = ink, width = 2) =>
    marks.push({
      kind: 'path',
      id,
      d,
      fill,
      stroke: active(id) ? gold : stroke,
      width: active(id) ? 5 : width,
    });
  const poly = (id: string, points: number[][], fill: string, stroke = ink) =>
    path(id, 'M' + points.map((p) => p.join(' ')).join('L') + 'Z', fill, stroke);
  const label = (
    id: string,
    text: string,
    x: number,
    y: number,
    size = 18,
    anchor: 'start' | 'middle' = 'start',
  ) => marks.push({ kind: 'text', id, x, y, text, size, anchor, color: active(id) ? gold : ink });
  const wrappedLabel = (id: string, text: string, x: number, y: number, limit = 24) => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && (line + ' ' + word).length > limit) {
        lines.push(line);
        line = word;
      } else line = line ? line + ' ' + word : word;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => label(id, l, x, y + i * 18, 16));
  };
  const ellipse = (id: string, x: number, y: number, rx: number, ry: number, fill: string) =>
    marks.push({
      kind: 'ellipse',
      id,
      x,
      y,
      rx,
      ry,
      fill,
      stroke: active(id) ? gold : ink,
      width: active(id) ? 5 : 2,
    });
  const arrow = (id: string, x: number, y: number, ex: number, ey: number, color = ink) => {
    path(id, `M${x} ${y}L${ex} ${ey}`, 'none', color, 4);
    const a = Math.atan2(ey - y, ex - x),
      size = 11;
    poly(
      id,
      [
        [ex, ey],
        [ex - size * Math.cos(a - 0.5), ey - size * Math.sin(a - 0.5)],
        [ex - size * Math.cos(a + 0.5), ey - size * Math.sin(a + 0.5)],
      ],
      color,
      color,
    );
  };
  let note = 'Schematic teaching model; not to scale.',
    description = spec.objective;
  if (spec.type === 'plate-tectonics') {
    const p = valueOf(s, 'progress'),
      view = spec.view,
      boundary = s.boundary;
    note =
      'Schematic, not to scale. Motion is greatly accelerated; real rates are measured in cm/year.';
    const layer = (
      id: string,
      x1: number,
      x2: number,
      top: number,
      bottom: number,
      color: string,
    ) =>
      poly(
        id,
        [
          [x1, top],
          [x2, top],
          [x2, bottom],
          [x1, bottom],
        ],
        color,
      );
    if (view !== 'boundaries' || boundary !== 'transform') {
      poly(
        'asthenosphere',
        [
          [40, 180],
          [680, 180],
          [680, 290],
          [40, 290],
        ],
        '#e8c295',
        '#ad916f',
      );
      for (let x = 70; x < 660; x += 60)
        path('asthenosphere', `M${x} 266q20 -20 40 0`, 'none', '#b39370', 1);
      label(
        'asthenosphere',
        test ? 'Deformable material below' : 'Ductile asthenosphere (mostly solid)',
        68,
        310,
        17,
      );
    }
    if (view === 'layers' || view === 'movement') {
      const offset = view === 'movement' ? p * 28 : 0;
      layer('plate-left', 45, 345 - offset, 105, 205, '#c5c5a2');
      layer('plate-right', 355 + offset, 675, 105, 205, '#aebfad');
      layer('crust', 45, 345 - offset, 105, 125, '#d8b47e');
      layer('crust', 355 + offset, 675, 105, 125, '#d8b47e');
      label('crust', test ? 'Outer layer' : 'Crust', 65, 63);
      path('crust', 'M110 69L145 114');
      label('mantle', test ? 'Rigid layer below crust' : 'Lithospheric mantle', 60, 165, 17);
      path('mantle', 'M255 170L282 177');
      path('plate-right', 'M690 106h12v99h-12');
      label(
        'plate-right',
        test ? 'Rigid outer slab' : 'Rigid lithosphere = crust + uppermost mantle',
        365,
        63,
        16,
        'middle',
      );
      if (view === 'movement') {
        arrow('motion', 265 - offset, 85, 185 - offset, 85);
        arrow('motion', 450 + offset, 85, 530 + offset, 85);
      } else {
        label('plate-left', 'Plate A', 180, 225, 16, 'middle');
        label('plate-right', 'Plate B', 530, 225, 16, 'middle');
      }
      description =
        'A thin crust and thicker rigid uppermost mantle form each lithospheric plate, above a ductile, mostly solid asthenosphere.';
    } else if (boundary === 'divergent') {
      const gap = 9 + p * 42;
      poly(
        'plate-left',
        [
          [40, 120],
          [330 - gap, 105],
          [350 - gap, 130],
          [350 - gap, 205],
          [40, 205],
        ],
        '#bdc8ab',
      );
      poly(
        'plate-right',
        [
          [350 + gap, 130],
          [370 + gap, 105],
          [680, 120],
          [680, 205],
          [350 + gap, 205],
        ],
        '#aebfae',
      );
      path(
        'crust',
        `M40 120L${330 - gap} 105L${350 - gap} 130M${350 + gap} 130L${370 + gap} 105L680 120`,
        'none',
        '#b9884d',
        12,
      );
      arrow('motion', 260 - p * 25, 80, 170 - p * 25, 80);
      arrow('motion', 450 + p * 25, 80, 540 + p * 25, 80);
      arrow('upwelling', 350, 260, 350, 145, gold);
      if (!test) {
        label('boundary', 'Ridge / rift', 350, 42, 18, 'middle');
        label('upwelling', 'Hot mantle rises', 430, 257, 17);
      }
      description =
        'Two lithospheric plates separate; mantle rises below the opening and a ridge or rift can develop.';
    } else if (boundary === 'convergent') {
      poly(
        'plate-right',
        [
          [360, 119],
          [470, 115],
          [515, 63],
          [557, 113],
          [680, 108],
          [680, 205],
          [370, 205],
        ],
        '#b9c4a6',
      );
      poly(
        'slab',
        [
          [40, 130],
          [320, 130],
          [370 + p * 45, 175 + p * 20],
          [510 + p * 50, 265],
          [490 + p * 50, 290],
          [345, 210],
          [300, 190],
          [40, 190],
        ],
        '#8ba9ad',
      );
      path(
        'crust',
        `M40 130L320 130L${370 + p * 45} ${175 + p * 20}L${510 + p * 50} 265`,
        'none',
        '#b28650',
        8,
      );
      path('volcano', 'M470 115L515 63L557 113M502 79L515 86L528 79', 'none', '#947144', 3);
      arrow('motion', 165 + p * 18, 85, 260 + p * 18, 85);
      arrow('motion', 635 - p * 18, 85, 570 - p * 18, 85);
      [0, 1, 2, 3].forEach((i) =>
        ellipse('earthquakes', 340 + i * 38 + p * 25, 169 + i * 25, 4, 4, gold),
      );
      if (!test) {
        label('slab', 'Oceanic plate descends', 60, 245, 16);
        label('volcano', 'Volcanic arc', 515, 39, 17, 'middle');
        label('earthquakes', 'Earthquakes along slab', 460, 318, 16);
      }
      description =
        'One oceanic plate descends beneath a continental plate; earthquakes occur along the slab and a volcanic arc can form.';
      note += ' One oceanic–continental example; continental collisions differ.';
    } else {
      const dy = p * 38;
      poly(
        'plate-left',
        [
          [95, 85 + dy],
          [315, 55 + dy],
          [350, 221 + dy],
          [130, 260 + dy],
        ],
        '#bdc8ab',
      );
      poly(
        'plate-right',
        [
          [337, 55 - dy],
          [570, 82 - dy],
          [620, 260 - dy],
          [372, 221 - dy],
        ],
        '#a9bfba',
      );
      path('boundary', 'M326 51L362 263', 'none', gold, 5);
      arrow('motion', 225, 125 + dy, 245, 215 + dy);
      arrow('motion', 480, 210 - dy, 460, 120 - dy);
      [0, 1, 2].forEach((i) => ellipse('earthquakes', 338 + i * 7, 117 + i * 40, 5, 5, gold));
      label('asthenosphere', 'Plan view: plates slide along a fault', 360, 328, 17, 'middle');
      if (!test) label('earthquakes', 'Earthquakes can occur', 360, 31, 18, 'middle');
      description =
        'Plan view of neighboring plates sliding in opposite directions along their shared fault.';
    }
    if (!test && view !== 'layers')
      label('motion', `Relative speed: ${valueOf(s, 'rate')} cm/year`, 360, 355, 16, 'middle');
  } else if (['function-graph', 'supply-demand'].includes(spec.type)) {
    const graph = spec.type === 'function-graph',
      xmin = graph ? -4 : 0,
      xmax = graph ? 4 : 10,
      ymin = graph ? -6 : 0,
      ymax = graph ? 10 : 12;
    const X = (x: number) => 85 + ((x - xmin) / (xmax - xmin)) * 550,
      Y = (y: number) => 300 - ((y - ymin) / (ymax - ymin)) * 250;
    for (let x = xmin; x <= xmax; x += graph ? 1 : 2) {
      path('axes', `M${X(x)} 50V300`, 'none', '#d5dfd6', 1);
      label('axes', String(x), X(x), 325, 15, 'middle');
    }
    for (let y = ymin; y <= ymax; y += 2) {
      path('axes', `M85 ${Y(y)}H635`, 'none', '#d5dfd6', 1);
      label('axes', String(y), 57, Y(y) + 5, 15);
    }
    arrow('axes', 85, Y(0), 654, Y(0));
    arrow('axes', X(0), 300, X(0), 32);
    label('axes', graph ? 'x' : 'Quantity', 650, 344, 16, 'middle');
    label('axes', graph ? 'y' : 'Price', 46, 28, 16);
    const curve = (id: string, f: (x: number) => number, color: string) => {
      let d = '',
        inside = false;
      for (let i = 0; i <= 250; i++) {
        const x = xmin + (i / 250) * (xmax - xmin),
          y = f(x);
        if (y >= ymin && y <= ymax) {
          d += `${inside ? 'L' : 'M'}${X(x)} ${Y(y)}`;
          inside = true;
        } else inside = false;
      }
      path(id, d, 'none', color, 3);
    };
    if (graph) {
      const a = valueOf(s, 'a'),
        b = valueOf(s, 'b'),
        c = valueOf(s, 'c');
      curve('curve', (x) => a * x * x + b * x + c, green);
      if (!test) label('curve', `y = ${a}x² + (${b})x + (${c})`, 400, 28, 19, 'middle');
      if (a && s.reveal && !test) {
        const x = -b / (2 * a),
          y = a * x * x + b * x + c;
        if (x >= xmin && x <= xmax && y >= ymin && y <= ymax) {
          ellipse('vertex', X(x), Y(y), 5, 5, gold);
          label('vertex', `Vertex (${x}, ${Number(y.toFixed(2))})`, 460, 357, 17, 'middle');
        }
      }
      note = 'Plot window: x ∈ [−4, 4], y ∈ [−6, 10]. Curves are clipped to this window.';
      description =
        'Cartesian axes with a sampled quadratic curve. Adjust a, b and c to change curvature, position and roots.';
    } else {
      const d = valueOf(s, 'demand'),
        supply = valueOf(s, 'supply'),
        q = (d - supply) / 1.2,
        price = supply + 0.6 * q;
      curve('demand', (x) => d - 0.6 * x, blue);
      curve('supply', (x) => supply + 0.6 * x, green);
      label('demand', 'Demand', 530, 280, 17);
      label('supply', 'Supply', 530, 77, 17);
      if (!test) {
        path('equilibrium', `M85 ${Y(price)}H${X(q)}V300`, 'none', gold);
        ellipse('equilibrium', X(q), Y(price), 6, 6, gold);
        label(
          'equilibrium',
          `Equilibrium: Q=${q.toFixed(2)}, P=${price.toFixed(2)}`,
          360,
          357,
          18,
          'middle',
        );
      }
      note = 'Illustrative linear market, arbitrary units. Other influences held constant.';
      description =
        'An upward supply curve and downward demand curve intersect at market equilibrium.';
    }
  } else if (spec.type === 'force-vectors') {
    const fx = valueOf(s, 'fx'),
      fy = valueOf(s, 'fy');
    path('object', 'M80 285H640', 'none', '#a3b2a0');
    poly(
      'object',
      [
        [310, 155],
        [370, 155],
        [370, 215],
        [310, 215],
      ],
      '#c2cbb7',
    );
    if (fx) arrow('force-x', 340, 185, 340 + fx * 16, 185, blue);
    if (fy) arrow('force-y', 340, 185, 340, 185 - fy * 16, green);
    if (s.reveal && !test && (fx || fy))
      arrow('resultant', 340, 185, 340 + fx * 16, 185 - fy * 16, gold);
    label('force-x', `Fx = ${fx} N`, 70, 45);
    label('force-y', `Fy = ${fy} N`, 440, 45);
    if (!test)
      label(
        'resultant',
        `Net force magnitude: ${Math.hypot(fx, fy).toFixed(2)} N`,
        360,
        335,
        19,
        'middle',
      );
    note = 'Selected applied force components; other forces are omitted. Positive y points upward.';
    description =
      'Force vectors anchored to an object; arrow direction and length encode sign and magnitude.';
  } else if (spec.type === 'cross-section') {
    const total = spec.layers.reduce((a, x) => a + x.thickness, 0),
      colors = ['#d6bb8e', '#b9c5a4', '#a6bcb3', '#e3c8a4', '#b3bbc1'];
    let y = 55;
    spec.layers.forEach((layer, i) => {
      const h = (layer.thickness / total) * 220;
      poly(
        layer.id,
        [
          [75, y],
          [455, y + 5],
          [455, y + h + 5],
          [75, y + h],
        ],
        colors[i]!,
      );
      path(layer.id, `M420 ${y + h / 2}H480L500 ${65 + i * 54}`);
      wrappedLabel(layer.id, layer.label, 505, 70 + i * 54, 22);
      y += h;
    });
    description = 'A schematic section with labeled material regions and anchored leader lines.';
  } else if (spec.type === 'structure') {
    spec.shapes.forEach((shape, i) => {
      if (shape.shape === 'ellipse') {
        const [c, r] = shape.points;
        ellipse(shape.id, c!.x, c!.y, r!.x, r!.y, '#c1cdb2');
      } else
        poly(
          shape.id,
          shape.points.map((p) => [p.x, p.y]),
          '#c1cdb2',
        );
      const p = shape.points[0]!;
      path(shape.id, `M${p.x} ${p.y}L480 ${65 + i * 52}`);
      wrappedLabel(shape.id, shape.label, 490, 65 + i * 52);
    });
  } else if (spec.type === 'relationships') {
    const n = spec.nodes.length,
      circular = ['cycle', 'concept-map', 'causal'].includes(spec.layout);
    const pos = new Map(
      spec.nodes.map((node, i) => [
        node.id,
        circular
          ? [
              360 + 230 * Math.cos((i / n) * Math.PI * 2 - Math.PI / 2),
              165 + 95 * Math.sin((i / n) * Math.PI * 2 - Math.PI / 2),
            ]
          : [90 + (i % 3) * 265, 95 + Math.floor(i / 3) * 155],
      ]),
    );
    const hidden = (id: string) =>
      spec.layout === 'logic' &&
      spec.nodes.some((x) => x.id === id && x.role === 'conclusion') &&
      (!s.reveal || test);
    spec.edges
      .filter((e) => !hidden(e.to))
      .forEach((e) => {
        const [x, y] = pos.get(e.from)!,
          [ex, ey] = pos.get(e.to)!,
          a = Math.atan2(ey! - y!, ex! - x!);
        arrow(
          e.from,
          x! + 39 * Math.cos(a),
          y! + 39 * Math.sin(a),
          ex! - 42 * Math.cos(a),
          ey! - 42 * Math.sin(a),
        );
        label(e.from, e.label, (x! + ex!) / 2, (y! + ey!) / 2 - 15, 14, 'middle');
      });
    spec.nodes.forEach((node) => {
      const [x, y] = pos.get(node.id)!;
      ellipse(node.id, x!, y!, 36, 28, node.role === 'rule' ? '#e3d6b8' : '#c4d4bf');
      const words = (hidden(node.id) ? 'Which conclusion?' : node.label).split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        if ((line + ' ' + word).length > 22) {
          lines.push(line);
          line = word;
        } else line = line ? line + ' ' + word : word;
      }
      if (line) lines.push(line);
      lines.forEach((l, i) => label(node.id, l, x!, y! + 48 + i * 18, 16, 'middle'));
    });
    note =
      spec.layout === 'logic'
        ? 'Only supplied facts and directed rules justify a conclusion. Missing support does not mean false.'
        : `Schematic ${spec.layout} with explicitly directed relationships.`;
  } else {
    description = 'reason' in spec ? spec.reason : 'Unsupported visual capability.';
    label(
      'fallback',
      spec.type === 'none' ? 'This concept uses verbal reasoning' : 'Visual capability unavailable',
      360,
      145,
      22,
      'middle',
    );
    label('fallback', 'Use the worked example and response task below.', 360, 195, 18, 'middle');
    note = description;
  }
  return { marks, description, note };
}
