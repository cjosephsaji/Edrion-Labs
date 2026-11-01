import type { VisualScene } from '../teaching/visual-scene';
/** Same geometry as Classic SVG. The room still owns its original board texture. */
export function paintVisual(ctx: CanvasRenderingContext2D, scene: VisualScene, font: string) {
  ctx.save();
  ctx.translate(296, 240);
  ctx.scale(1.4, 1.4);
  for (const mark of scene.marks) {
    if (mark.kind === 'text') {
      ctx.font = `500 ${mark.size}px ${font}`;
      ctx.fillStyle = mark.color;
      ctx.textAlign = mark.anchor === 'middle' ? 'center' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(mark.text, mark.x, mark.y);
    } else {
      ctx.fillStyle = mark.fill;
      ctx.strokeStyle = mark.stroke;
      ctx.lineWidth = mark.width;
      ctx.lineJoin = 'round';
      if (mark.kind === 'path') {
        const p = new Path2D(mark.d);
        if (mark.fill !== 'none') ctx.fill(p);
        ctx.stroke(p);
      } else {
        ctx.beginPath();
        ctx.ellipse(mark.x, mark.y, mark.rx, mark.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
