import { Object3D } from './Object3D';
import type { SplatData } from './SplatData';
import type { Vec3 } from '../utils/Math';

// GPU layout: 32 bytes per splat, two RGBA32UI texels (WebGL) or two vec4u (WebGPU).
//   texel 0: position.xyz (f32 bits), color rgba8
//   texel 1: 3D covariance as 6 halfs (xx xy | xz yy | yz zz), unused
// The vertex shader pulls a splat by index, so sorting only reorders `order`.
export const UINTS_PER_SPLAT = 8;

// Covariance is stored scaled so the largest entry lands well inside the half
// range; tiny splats keep precision instead of flushing to zero.
const COV_TARGET_MAX = 32768;

const SORT_THRESHOLD = 0.1; // camera movement that triggers a re-sort
const SORT_BUCKETS = 65536;

export class SplatMesh extends Object3D {
  readonly count: number;
  readonly packed: Uint32Array<ArrayBuffer>;
  readonly covScale: number; // packed covariance = Σ * covScale
  readonly order: Uint32Array<ArrayBuffer>; // splat indices, back to front
  needsOrderUpload = true;

  private packedFloats: Float32Array;
  private distances: Float32Array;
  private keys: Uint16Array;
  private counts = new Uint32Array(SORT_BUCKETS);
  private lastSortPosition: Vec3 | null = null;

  constructor(data: SplatData) {
    super();
    this.count = data.count;
    const { packed, covScale } = packSplats(data);
    this.packed = packed;
    this.covScale = covScale;
    this.packedFloats = new Float32Array(packed.buffer);
    this.order = new Uint32Array(this.count);
    this.distances = new Float32Array(this.count);
    this.keys = new Uint16Array(this.count);
  }

  // Back-to-front counting sort on distance to the camera, quantized to 16 bits.
  // Distance (not view depth) is rotation invariant, so only movement re-sorts.
  sort(cameraPosition: Vec3): void {
    const last = this.lastSortPosition;
    if (last) {
      const dx = cameraPosition[0] - last[0];
      const dy = cameraPosition[1] - last[1];
      const dz = cameraPosition[2] - last[2];
      if (dx * dx + dy * dy + dz * dz <= SORT_THRESHOLD * SORT_THRESHOLD) return;
    }

    const { count, packedFloats: p, distances, keys, counts, order } = this;
    const [cx, cy, cz] = cameraPosition;

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * UINTS_PER_SPLAT;
      const dx = p[o]! - cx;
      const dy = p[o + 1]! - cy;
      const dz = p[o + 2]! - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distances[i] = d;
      if (d < min) min = d;
      if (d > max) max = d;
    }

    // farthest splat gets key 0 and is drawn first
    const scale = max > min ? (SORT_BUCKETS - 1) / (max - min) : 0;
    counts.fill(0);
    for (let i = 0; i < count; i++) {
      const key = ((max - distances[i]!) * scale) | 0;
      keys[i] = key;
      counts[key]!++;
    }

    let offset = 0;
    for (let b = 0; b < SORT_BUCKETS; b++) {
      const c = counts[b]!;
      counts[b] = offset;
      offset += c;
    }

    for (let i = 0; i < count; i++) {
      order[counts[keys[i]!]!++] = i;
    }

    this.lastSortPosition = [cx, cy, cz];
    this.needsOrderUpload = true;
  }
}

function packSplats(data: SplatData): { packed: Uint32Array<ArrayBuffer>; covScale: number } {
  const { count, positions, rotations, scales, colors } = data;
  const cov = new Float32Array(count * 6);

  let maxCov = 0;
  for (let i = 0; i < count; i++) {
    let x = rotations[i * 4]!;
    let y = rotations[i * 4 + 1]!;
    let z = rotations[i * 4 + 2]!;
    let w = rotations[i * 4 + 3]!;
    const len = Math.hypot(x, y, z, w) || 1;
    x /= len;
    y /= len;
    z /= len;
    w /= len;

    // M = R * S, Σ = M Mᵀ
    const sx = scales[i * 3]!;
    const sy = scales[i * 3 + 1]!;
    const sz = scales[i * 3 + 2]!;
    const m00 = (1 - 2 * (y * y + z * z)) * sx;
    const m01 = 2 * (x * y - w * z) * sy;
    const m02 = 2 * (x * z + w * y) * sz;
    const m10 = 2 * (x * y + w * z) * sx;
    const m11 = (1 - 2 * (x * x + z * z)) * sy;
    const m12 = 2 * (y * z - w * x) * sz;
    const m20 = 2 * (x * z - w * y) * sx;
    const m21 = 2 * (y * z + w * x) * sy;
    const m22 = (1 - 2 * (x * x + y * y)) * sz;

    const o = i * 6;
    cov[o] = m00 * m00 + m01 * m01 + m02 * m02;
    cov[o + 1] = m00 * m10 + m01 * m11 + m02 * m12;
    cov[o + 2] = m00 * m20 + m01 * m21 + m02 * m22;
    cov[o + 3] = m10 * m10 + m11 * m11 + m12 * m12;
    cov[o + 4] = m10 * m20 + m11 * m21 + m12 * m22;
    cov[o + 5] = m20 * m20 + m21 * m21 + m22 * m22;

    // off-diagonals are bounded by the diagonal
    maxCov = Math.max(maxCov, cov[o]!, cov[o + 3]!, cov[o + 5]!);
  }

  const covScale = maxCov > 0 ? COV_TARGET_MAX / maxCov : 1;
  const packed = new Uint32Array(count * UINTS_PER_SPLAT);
  const packedFloats = new Float32Array(packed.buffer);

  for (let i = 0; i < count; i++) {
    const o = i * UINTS_PER_SPLAT;
    packedFloats[o] = positions[i * 3]!;
    packedFloats[o + 1] = positions[i * 3 + 1]!;
    packedFloats[o + 2] = positions[i * 3 + 2]!;
    packed[o + 3] =
      (toUnorm8(colors[i * 4]!) |
        (toUnorm8(colors[i * 4 + 1]!) << 8) |
        (toUnorm8(colors[i * 4 + 2]!) << 16) |
        (toUnorm8(colors[i * 4 + 3]!) << 24)) >>>
      0;

    const c = i * 6;
    packed[o + 4] = packHalf2(cov[c]! * covScale, cov[c + 1]! * covScale);
    packed[o + 5] = packHalf2(cov[c + 2]! * covScale, cov[c + 3]! * covScale);
    packed[o + 6] = packHalf2(cov[c + 4]! * covScale, cov[c + 5]! * covScale);
  }

  return { packed, covScale };
}

function toUnorm8(v: number): number {
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

// float32 -> float16 bits, round to nearest
function toHalf(v: number): number {
  f32[0] = v;
  const x = u32[0]!;
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  const mant = x & 0x7fffff;

  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    const m = (mant | 0x800000) >> (1 - exp);
    return sign | ((m + 0x1000) >> 13);
  }
  return sign | ((exp << 10) + ((mant + 0x1000) >> 13));
}

// matches unpackHalf2x16 / unpack2x16float: a in the low 16 bits
function packHalf2(a: number, b: number): number {
  return (toHalf(a) | (toHalf(b) << 16)) >>> 0;
}
