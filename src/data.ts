export interface GaussianSplat {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
  opacity: number;
  sh?: Float32Array;
}

export const testSplat: GaussianSplat = {
  position: [0, 0, 0],
  rotation: [1, 0, 0, 0],
  scale: [1, 1, 1],
  color: [1, 0, 0],
  opacity: 1.0,
  sh: new Float32Array([
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
    0.1, 0.2, 0.3,
  ]),
};

export const testTriangle = new Float32Array([
  0.0, 0.5, 0.0,
  -0.5, -0.5, 0.0,
  0.5, -0.5, 0.0,
]);

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

export const testCube = new Float32Array([
  -0.5, -0.5,  0.5,
   0.5, -0.5,  0.5,
   0.5,  0.5,  0.5,
  -0.5,  0.5,  0.5,
  -0.5, -0.5, -0.5,
   0.5, -0.5, -0.5,
   0.5,  0.5, -0.5,
  -0.5,  0.5, -0.5,
]);

export const testCubeIndices = new Uint16Array([
  0, 1, 2,  0, 2, 3,
  1, 5, 6,  1, 6, 2,
  5, 4, 7,  5, 7, 6,
  4, 0, 3,  4, 3, 7,
  3, 2, 6,  3, 6, 7,
  4, 5, 1,  4, 1, 0,
]);
