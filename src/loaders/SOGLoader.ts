import { unzipSync } from 'fflate';
import { createSplatData, rotateZ180, type SplatData } from '../core/SplatData';
import { decodeImage, type RawImage } from './decodeImage';

// PlayCanvas SOG v2: splat attributes stored as lossless WebP images.
// https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/
// Accepts a bundled .sog (zip) or the meta.json of an unbundled directory.
// Higher-order SH (shN) is skipped, as it is not rendered yet.

export interface SOGMeta {
  version: number;
  count: number;
  model?: string;
  means: { mins: number[]; maxs: number[]; files: string[] };
  scales: { codebook: number[]; files: string[] };
  quats: { files: string[] };
  sh0: { codebook: number[]; files: string[] };
}

export interface SOGImages {
  meansL: RawImage;
  meansU: RawImage;
  quats: RawImage;
  scales: RawImage;
  sh0: RawImage;
}

const SH_C0 = 0.28209479177387814;

export class SOGLoader {
  async load(url: string): Promise<SplatData> {
    const files = url.endsWith('.json') ? await fetchUnbundled(url) : await fetchBundled(url);

    const metaBytes = await files('meta.json');
    const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as SOGMeta;
    if (meta.version !== 2) throw new Error(`Unsupported SOG version ${meta.version}`);
    if (meta.model) console.warn(`SOG model "${meta.model}" is rendered as plain 3DGS`);

    const image = async (name: string | undefined) => {
      if (!name) throw new Error('SOG meta.json is missing a file name');
      return decodeImage(await files(name));
    };

    const [meansL, meansU, quats, scales, sh0] = await Promise.all([
      image(meta.means.files[0]),
      image(meta.means.files[1]),
      image(meta.quats.files[0]),
      image(meta.scales.files[0]),
      image(meta.sh0.files[0]),
    ]);

    const data = decodeSOG(meta, { meansL, meansU, quats, scales, sh0 });
    rotateZ180(data);
    console.log(`Loaded ${data.count} splats from ${url}`);
    return data;
  }
}

type FileSource = (name: string) => Promise<Uint8Array>;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchBundled(url: string): Promise<FileSource> {
  const entries = unzipSync(await fetchBytes(url));
  return async (name) => {
    const entry = entries[name];
    if (!entry) throw new Error(`${name} not found in ${url}`);
    return entry;
  };
}

async function fetchUnbundled(metaUrl: string): Promise<FileSource> {
  const base = new URL(metaUrl, window.location.href);
  return (name) => fetchBytes(new URL(name, base).href);
}

// Pure decode, independent of how the images were read. Pixel i is splat i.
export function decodeSOG(meta: SOGMeta, images: SOGImages): SplatData {
  const { count } = meta;
  for (const [name, img] of Object.entries(images)) {
    if (img.width * img.height < count) throw new Error(`SOG image ${name} is too small`);
  }

  const data = createSplatData(count);
  const { positions, rotations, scales, colors } = data;
  const { mins, maxs } = meta.means;
  const scaleBook = meta.scales.codebook;
  const colorBook = meta.sh0.codebook;
  const L = images.meansL.data;
  const U = images.meansU.data;
  const Q = images.quats.data;
  const S = images.scales.data;
  const C = images.sh0.data;

  // stored component c in [0, 255] -> [-1/sqrt2, 1/sqrt2]
  const toComp = (c: number) => (c / 255 - 0.5) * Math.SQRT2;

  for (let i = 0; i < count; i++) {
    const o = i * 4;

    // 16-bit position per axis in a symmetric log domain
    for (let k = 0; k < 3; k++) {
      const q = (U[o + k]! << 8) | L[o + k]!;
      const n = mins[k]! + (maxs[k]! - mins[k]!) * (q / 65535);
      positions[i * 3 + k] = Math.sign(n) * (Math.exp(Math.abs(n)) - 1);
    }

    // smallest three: rgb are the kept components in (w, x, y, z) order,
    // alpha - 252 is the index of the dropped (largest) one
    const a = toComp(Q[o]!);
    const b = toComp(Q[o + 1]!);
    const c = toComp(Q[o + 2]!);
    const d = Math.sqrt(Math.max(0, 1 - a * a - b * b - c * c));
    let w: number, x: number, y: number, z: number;
    switch (Q[o + 3]! - 252) {
      case 0: [w, x, y, z] = [d, a, b, c]; break;
      case 1: [w, x, y, z] = [a, d, b, c]; break;
      case 2: [w, x, y, z] = [a, b, d, c]; break;
      case 3: [w, x, y, z] = [a, b, c, d]; break;
      default: throw new Error(`Invalid SOG quaternion mode at splat ${i}`);
    }
    rotations[i * 4] = x;
    rotations[i * 4 + 1] = y;
    rotations[i * 4 + 2] = z;
    rotations[i * 4 + 3] = w;

    // codebook indices, log domain
    for (let k = 0; k < 3; k++) {
      scales[i * 3 + k] = Math.exp(scaleBook[S[o + k]!]!);
    }

    // DC color via codebook, opacity in alpha
    for (let k = 0; k < 3; k++) {
      colors[i * 4 + k] = 0.5 + colorBook[C[o + k]!]! * SH_C0;
    }
    colors[i * 4 + 3] = C[o + 3]! / 255;
  }

  return data;
}
