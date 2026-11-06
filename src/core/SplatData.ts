// CPU-side splat attributes as struct of arrays. Loaders produce this,
// SplatMesh packs it for the GPU.
export interface SplatData {
  count: number;
  positions: Float32Array; // xyz
  rotations: Float32Array; // quaternion xyzw
  scales: Float32Array; // xyz, linear
  colors: Float32Array; // rgb + opacity
}

export function createSplatData(count: number): SplatData {
  return {
    count,
    positions: new Float32Array(count * 3),
    rotations: new Float32Array(count * 4),
    scales: new Float32Array(count * 3),
    colors: new Float32Array(count * 4),
  };
}

// 180° rotation about z, converting the y-down convention of 3DGS training
// output to y-up. Applied to positions and (as qFlip * q) to rotations.
export function rotateZ180(data: SplatData): void {
  const { count, positions: p, rotations: r } = data;
  for (let i = 0; i < count; i++) {
    p[i * 3] = -p[i * 3]!;
    p[i * 3 + 1] = -p[i * 3 + 1]!;

    const x = r[i * 4]!;
    const y = r[i * 4 + 1]!;
    const z = r[i * 4 + 2]!;
    const w = r[i * 4 + 3]!;
    r[i * 4] = -y;
    r[i * 4 + 1] = x;
    r[i * 4 + 2] = w;
    r[i * 4 + 3] = -z;
  }
}
