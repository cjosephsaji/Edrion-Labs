'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { StageLesson } from './lesson';
import { clamp, format } from './logic';
import { stageScreenPoint, type StageViewport } from './viewport';
export function StageLabels<S>({
  lesson,
  state,
  story,
  root,
  intro,
  selected,
  demo,
}: {
  lesson: StageLesson<S>;
  state: S;
  story: boolean;
  root: RefObject<HTMLElement | null>;
  intro: RefObject<number>;
  selected: string | null;
  demo: { id: string; at: number } | null;
}) {
  const { camera, size, gl } = useThree(),
    point = useRef(new Vector3());
  const layout = useRef<{
    safe: DOMRect;
    host: DOMRect;
    viewport: StageViewport;
    sizes: Map<string, { w: number; h: number }>;
    cardTop?: number;
    footerTop?: number;
  } | null>(null);
  const labelWidths = lesson.labels
    .map((l) => labelValue(l.id, state, lesson, story).length)
    .join(',');
  useEffect(() => {
    layout.current = null;
    void document.fonts.ready.then(() => {
      layout.current = null;
    });
  }, [size.width, size.height, selected, story, labelWidths]);
  useFrame(() => {
    const host = root.current;
    if (!host) return;
    if (!layout.current) {
      const safe = host
        .querySelector('[data-stage-area]')
        ?.getBoundingClientRect();
      if (!safe) return;
      const sizes = new Map<string, { w: number; h: number }>();
      host.querySelectorAll<HTMLElement>('[data-stage-label]').forEach((el) =>
        sizes.set(el.dataset.stageLabel!, {
          w: el.offsetWidth,
          h: el.offsetHeight,
        }),
      );
      const hostBox = host.getBoundingClientRect(),
        canvasBox = gl.domElement.getBoundingClientRect();
      const card =
        hostBox.width < 720
          ? host
              .querySelector('[data-testid="stage-explainer"]')
              ?.getBoundingClientRect()
          : undefined;
      layout.current = {
        safe,
        host: hostBox,
        viewport: {
          ...size,
          x: canvasBox.x - hostBox.x,
          y: canvasBox.y - hostBox.y,
        },
        sizes,
        cardTop: card?.top,
        footerTop: host.querySelector('footer')?.getBoundingClientRect().top,
      };
    }
    const {
      safe,
      host: hr,
      viewport,
      sizes,
      cardTop,
      footerTop,
    } = layout.current;
    const mobile = hr.width < 720;
    const anchors = new Map<
      string,
      {
        x: number;
        y: number;
        r: number;
        bounds?: { left: number; right: number };
      }
    >();
    for (const p of lesson.parts) {
      point.current.set(...p.anchor(state)).project(camera);
      const { x, y } = stageScreenPoint(point.current, viewport);
      anchors.set(p.id, {
        x,
        y,
        r:
          (p.radius * size.height * camera.projectionMatrix.elements[5]) /
          (Math.max(
            1,
            camera.position.distanceTo(new Vector3(...p.anchor(state))),
          ) *
            2),
      });
      const hit = host.querySelector<HTMLElement>(
        `[data-stage-anchor="${p.id}"]`,
      );
      if (hit) {
        const r = anchors.get(p.id)!.r;
        let left = x - r,
          right = x + r,
          top = y - r,
          bottom = y + r;
        if (p.boundsPoints && selected === p.id) {
          left = top = Infinity;
          right = bottom = -Infinity;
          for (const v of p.boundsPoints(state)) {
            point.current.set(...v).project(camera);
            const { x: px, y: py } = stageScreenPoint(point.current, viewport);
            left = Math.min(left, px);
            right = Math.max(right, px);
            top = Math.min(top, py);
            bottom = Math.max(bottom, py);
          }
        }
        hit.style.transform = `translate(${left}px,${top}px)`;
        anchors.get(p.id)!.bounds = { left, right };
        hit.style.width = `${right - left}px`;
        hit.style.height = `${bottom - top}px`;
      }
    }
    const minY = safe.top - hr.top - 10,
      maxY = Math.min(
        safe.bottom - hr.top + 12,
        cardTop !== undefined ? cardTop - hr.top - 12 : Infinity,
      ),
      radialMaxY = Math.min(
        footerTop !== undefined ? footerTop - hr.top - 14 : maxY,
        cardTop !== undefined ? cardTop - hr.top - 12 : Infinity,
      );
    const used: { x: number; y: number; w: number; h: number }[] = [];
    const avoid = {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    };
    if (!selected || selected === 'whole')
      for (const v of lesson.labelAvoidPoints ?? []) {
        point.current.set(...v).project(camera);
        const { x, y } = stageScreenPoint(point.current, viewport);
        avoid.left = Math.min(avoid.left, x);
        avoid.right = Math.max(avoid.right, x);
        avoid.top = Math.min(avoid.top, y);
        avoid.bottom = Math.max(avoid.bottom, y);
      }
    for (const label of lesson.labels) {
      const id = label.id;
      const p = anchors.get(id)!,
        el = host.querySelector<HTMLElement>(`[data-stage-label="${id}"]`);
      if (!el) continue;
      const output = el.querySelector('b');
      if (output && id === 'input-0') {
        const phase =
          demo?.id === 'tokens'
            ? clamp((performance.now() - demo.at) / 1500)
            : 1;
        output.textContent = `${format(label.value(state) * phase)}${story ? ` ${lesson.story.units[id]}` : ''}`;
      }
      const { w, h } = sizes.get(id) ?? { w: 160, h: 31 };
      let x = p.x,
        y = p.y - p.r - 40;
      y = p.y - p.r - (label.offset ?? 40) * (mobile ? 0.65 : 1);
      if (label.placement === 'upper' || label.placement === 'lower') {
        const other = anchors.get(label.opposite ?? '') ?? p;
        x = p.x + p.r + w / 2 + (mobile ? 10 : 30);
        y =
          label.placement === 'upper'
            ? Math.min(p.y - p.r, other.y - other.r) - 30
            : Math.max(p.y + p.r, other.y + other.r) + 30;
      }
      if (label.placement === 'left' || label.placement === 'right') {
        x =
          p.x +
          (label.placement === 'left' ? -1 : 1) *
            (p.r + w / 2 + (mobile ? 10 : 24));
        y = p.y;
      }
      if (label.screenOffset) {
        x += label.screenOffset[0] * (mobile ? 0.65 : 1);
        y += label.screenOffset[1] * (mobile ? 0.65 : 1);
      }
      if (label.placement === 'radial') {
        point.current
          .set(...(label.radialFrom?.(state) ?? [0, 0, 0]))
          .project(camera);
        const { x: cx, y: cy } = stageScreenPoint(point.current, viewport);
        let ex = p.x,
          ey = p.y;
        if (label.radialEdge) {
          point.current.set(...label.radialEdge(state)).project(camera);
          const edge = stageScreenPoint(point.current, viewport);
          ex = edge.x;
          ey = edge.y;
        }
        const vx = ex - cx,
          vy = ey - cy,
          length = Math.max(0.001, Math.hypot(vx, vy)),
          dx = vx / length,
          dy = vy / length;
        const distance =
          (label.radialEdge ? 0 : p.r) +
          (Math.abs(dx) * w) / 2 +
          (Math.abs(dy) * h) / 2 +
          (mobile ? 14 : 24);
        x = ex + dx * distance;
        y = ey + dy * distance;
      }
      if (selected === id && label.sideOnFocus) {
        x =
          label.sideOnFocus === 'right'
            ? (p.bounds?.right ?? p.x + p.r) + w / 2 + 18
            : (p.bounds?.left ?? p.x - p.r) - w / 2 - 18;
        y = p.y;
      }
      if (
        (label.placement === 'lower' ||
          label.placement === 'left' ||
          label.placement === 'right') &&
        x + w / 2 > avoid.left &&
        x - w / 2 < avoid.right &&
        y + h / 2 > avoid.top &&
        y - h / 2 < avoid.bottom
      )
        y = avoid.bottom + h / 2 + 10;
      x = clamp(x, w / 2 + 12, hr.width - w / 2 - 12);
      y = clamp(y, minY + h / 2, maxY - h / 2);
      for (let attempt = 0; attempt < 8; attempt++) {
        const collision = used.find(
          (a) =>
            Math.abs(x - a.x) < (w + a.w) / 2 + 6 &&
            Math.abs(y - a.y) < (h + a.h) / 2 + 6,
        );
        if (!collision) break;
        y = clamp(
          collision.y +
            (label.placement === 'upper' ? -1 : 1) *
              ((h + collision.h) / 2 + 8),
          minY + h / 2,
          (label.placement === 'radial' ? Math.max(maxY, radialMaxY) : maxY) -
            h / 2,
        );
        if (attempt > 3) {
          const right = collision.x + (collision.w + w) / 2 + 8;
          x =
            label.placement === 'radial' && right + w / 2 <= hr.width - 12
              ? right
              : clamp(
                  label.placement === 'radial'
                    ? collision.x - (collision.w + w) / 2 - 8
                    : x - w * 0.65,
                  w / 2 + 12,
                  hr.width - w / 2 - 12,
                );
        }
      }
      used.push({ x, y, w, h });
      el.style.transform = `translate(${x - w / 2}px,${y - h / 2}px)`;
      const selectedChip = lesson.chips.find((q) => q.part === selected);
      const visible =
        !selected ||
        selected === 'whole' ||
        selected === id ||
        !!selectedChip?.also?.includes(id);
      const active = visible && (label.visible?.(state) ?? true);
      const opacity = clamp((intro.current - 1.6) / 0.6) * (active ? 1 : 0);
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity > 0.3 ? 'auto' : 'none';
      const world = lesson.parts.find((part) => part.id === id)!.anchor(state),
        offset = label.anchorOffset ?? [0, 0, 0];
      point.current
        .set(world[0] + offset[0], world[1] + offset[1], world[2] + offset[2])
        .project(camera);
      const { x: dx, y: dy } = stageScreenPoint(point.current, viewport);
      const line = host.querySelector<SVGLineElement>(`[data-leader="${id}"]`),
        dot = host.querySelector<SVGCircleElement>(`[data-dot="${id}"]`);
      if (line) {
        line.setAttribute('x1', String(dx));
        line.setAttribute('y1', String(dy));
        line.setAttribute('x2', String(clamp(p.x, x - w / 2, x + w / 2)));
        line.setAttribute('y2', String(y));
        line.style.opacity = String(opacity * 0.5);
      }
      if (dot) {
        dot.setAttribute('cx', String(dx));
        dot.setAttribute('cy', String(dy));
        dot.style.opacity = String(opacity);
      }
    }
    host.querySelectorAll<HTMLElement>('[data-stage-ruler]').forEach((el) => {
      const v = Number(el.dataset.stageRuler);
      point.current
        .set(...(lesson.ruler?.anchor(v, state) ?? [0, 0, 0]))
        .project(camera);
      const screen = stageScreenPoint(point.current, viewport);
      el.style.transform = `translate(${screen.x}px,${screen.y}px)${lesson.ruler?.align === 'end' ? ' translate(-100%,-50%)' : ''}`;
      el.style.opacity =
        (!selected || lesson.ruler?.visibleFor.includes(selected)) &&
        point.current.x > -0.94 &&
        point.current.x < 0.94 &&
        screen.y >= minY &&
        screen.y <= maxY &&
        intro.current >= 1.6
          ? '1'
          : '0';
    });
    // This attribute records the same unit decision used by the DOM labels.
    host.dataset.story = String(story);
  });
  return null;
}
export function labelValue<S>(
  id: string,
  state: S,
  lesson: StageLesson<S>,
  story: boolean,
) {
  const value = lesson.labels.find((l) => l.id === id)?.value(state) ?? 0;
  const label = lesson.labels.find((l) => l.id === id)!;
  if (label.text) return label.text(state);
  const unit = label.unit ?? (story ? lesson.story.units[id] : undefined);
  return `${format(value, label.digits ?? 2)}${unit ? ` ${unit}` : ''}`;
}
