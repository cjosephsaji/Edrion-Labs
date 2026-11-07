'use client';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
export interface PrintLine {
  text: string;
  color: string;
  size: number;
  y: number;
  x?: number;
  mono?: boolean;
}
/** Local engraved/printed specimen markings, using fonts already self-hosted by Petros. */
export function useStagePrint(
  lines: PrintLine[],
  { width = 512, height = 512 }: { width?: number; height?: number } = {},
) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  const key = JSON.stringify(lines),
    texture = useMemo(() => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d')!;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of lines) {
        ctx.font = `500 ${l.size}px "${l.mono ? 'Stage Mono' : 'Stage UI'}",sans-serif`;
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, l.x ?? width / 2, l.y, width - 42);
      }
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }, [key, ready, width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
