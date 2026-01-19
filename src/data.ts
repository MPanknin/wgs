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

