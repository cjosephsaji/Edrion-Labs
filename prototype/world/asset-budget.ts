import * as THREE from 'three';
/** Resident buffer/map estimate, not a claim to measure driver-allocated GPU memory. */
export function assetBudget(scene: THREE.Scene, gl: THREE.WebGLRenderer) {
  const geometries = new Set<THREE.BufferGeometry>();
  const arrays = new Set<ArrayBufferLike>();
  const textures = new Set<THREE.Texture>();
  let geometryBytes = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      for (const value of Object.values(m))
        if (value instanceof THREE.Texture) textures.add(value);
    for (const material of Array.isArray(o.material)
      ? o.material
      : [o.material])
      if (material instanceof THREE.ShaderMaterial)
        for (const uniform of Object.values(material.uniforms))
          if (uniform.value instanceof THREE.Texture)
            textures.add(uniform.value);
  });
  for (const g of geometries) {
    for (const a of [...Object.values(g.attributes), g.index]) {
      if (!a) continue;
      const array = 'data' in a ? a.data.array : a.array;
      if (!arrays.has(array.buffer)) {
        arrays.add(array.buffer);
        geometryBytes += array.buffer.byteLength;
      }
    }
  }
  const maps = [...textures].map((t) => {
    const source = t.image;
    const width = Number(source?.width ?? 0),
      height = Number(source?.height ?? 0);
    return {
      name:
        t.name ||
        (source instanceof HTMLCanvasElement
          ? 'generated teaching/label canvas'
          : 'original Petros pose'),
      width,
      height,
      estimatedBytes: Math.ceil(
        width * height * 4 * (t.generateMipmaps ? 4 / 3 : 1),
      ),
    };
  });
  return {
    drawCalls: gl.info.render.calls,
    renderedTriangles: gl.info.render.triangles,
    geometries: geometries.size,
    geometryBytes,
    textureCount: maps.length,
    textureBytesEstimated: maps.reduce((s, t) => s + t.estimatedBytes, 0),
    maps,
    drawingBuffer: gl.getDrawingBufferSize(new THREE.Vector2()).toArray(),
    pixelRatio: gl.getPixelRatio(),
    shadows: gl.shadowMap.enabled,
    exposure: gl.toneMappingExposure,
    rendererObjects: { ...gl.info.memory },
    estimateExcludes:
      'PMREM, shadow maps, framebuffer/MSAA, driver overhead; RGBA8 mipmapped material maps assumed.',
  };
}
