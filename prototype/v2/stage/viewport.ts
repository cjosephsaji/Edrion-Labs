import type { PerspectiveCamera } from 'three';

export interface StageViewport {
  width: number;
  height: number;
  x: number;
  y: number;
}

/** A crop of the same full-window film, without changing perspective or scale. */
export function setStageView(
  camera: PerspectiveCamera,
  film: { width: number; height: number },
  viewport: StageViewport,
  center: { x: number; y: number },
) {
  camera.setViewOffset(
    film.width,
    film.height,
    film.width / 2 - center.x + viewport.x,
    film.height / 2 - center.y + viewport.y,
    viewport.width,
    viewport.height,
  );
}

export function stageScreenPoint(
  ndc: { x: number; y: number },
  viewport: StageViewport,
) {
  return {
    x: (ndc.x * 0.5 + 0.5) * viewport.width + viewport.x,
    y: (-ndc.y * 0.5 + 0.5) * viewport.height + viewport.y,
  };
}
