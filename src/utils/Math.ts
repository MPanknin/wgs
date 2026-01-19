export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number]; // [x, y, z, w]

export function createModelMatrix(
  position: Vec3,
  rotation: Quaternion,
  scale: Vec3,
  out: Float32Array
): void {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;

  // quaternion to rotation matrix
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  // apply scale to rotation matrix 
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;

  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;

  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;

  // set position
  out[12] = position[0];
  out[13] = position[1];
  out[14] = position[2];
  out[15] = 1;
}
