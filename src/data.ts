export interface GaussianSplat {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
  opacity: number;
  sh?: Float32Array;
}

export const testQuad = new Float32Array([
  -0.5, 0.5, 0.0,
  -0.5, -0.5, 0.0,
  0.5, -0.5, 0.0,
  0.5, 0.5, 0.0,
]);

export const testQuadIndices = new Uint16Array([
  0, 1, 2,
  0, 2, 3,
]);
