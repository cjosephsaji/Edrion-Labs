import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { setStageView, stageScreenPoint } from '../stage/viewport';

describe('Stage hero viewport', () => {
  it('preserves full-window composition, perspective and label positions when cropped', () => {
    const film = { width: 1440, height: 900 },
      center = { x: 870, y: 370 },
      full = { x: 0, y: 0, ...film },
      cropped = { x: 300, y: 70, width: 1140, height: 620 };
    const camera = new PerspectiveCamera(
      30,
      film.width / film.height,
      0.1,
      150,
    );
    camera.position.set(4, 8, 22);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const points = [
      new Vector3(-3.3, 0, -3.3),
      new Vector3(3.3, 0, 3.3),
      new Vector3(1.4, 2.8, 0.6),
      new Vector3(-2, 0.6, 2),
    ];
    setStageView(camera, film, full, center);
    const original = points.map((p) =>
        stageScreenPoint(p.clone().project(camera), full),
      ),
      focalPixels = (camera.projectionMatrix.elements[5] * full.height) / 2;
    setStageView(camera, film, cropped, center);
    points.forEach((p, i) => {
      const screen = stageScreenPoint(p.clone().project(camera), cropped);
      expect(screen.x).toBeCloseTo(original[i].x, 8);
      expect(screen.y).toBeCloseTo(original[i].y, 8);
    });
    expect(
      (camera.projectionMatrix.elements[5] * cropped.height) / 2,
    ).toBeCloseTo(focalPixels, 8);
    expect(camera.fov).toBe(30);
  });

  it('keeps the phone using its complete film and centered safe area', () => {
    const film = { width: 390, height: 844 },
      viewport = { x: 0, y: 0, ...film },
      center = { x: 195, y: 310 },
      camera = new PerspectiveCamera(30, film.width / film.height);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    setStageView(camera, film, viewport, center);
    const screen = stageScreenPoint(new Vector3().project(camera), viewport);
    expect(screen.x).toBeCloseTo(center.x, 8);
    expect(screen.y).toBeCloseTo(center.y, 8);
  });
});
