import { createSplatData, rotateZ180, type SplatData } from '../core/SplatData';

interface ChunkMetadata {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  minScaleX: number;
  minScaleY: number;
  minScaleZ: number;
  maxScaleX: number;
  maxScaleY: number;
  maxScaleZ: number;
  minR: number;
  minG: number;
  minB: number;
  maxR: number;
  maxG: number;
  maxB: number;
}

const CHUNK_SIZE = 256;

// unpack 11/10/11 bit normalized values
function unpack111011(value: number): [number, number, number] {
  return [
    ((value >>> 21) & 0x7FF) / 2047.0,
    ((value >>> 11) & 0x3FF) / 1023.0,
    (value & 0x7FF) / 2047.0,
  ];
}

interface PLYHeader {
  chunkCount: number;
  vertexCount: number;
  shCount: number;
  headerEndOffset: number;
}

// Reads SuperSplat's compressed .ply. Higher-order SH is skipped (not rendered yet).
export class PLYLoader {
  async load(url: string): Promise<SplatData> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const header = this.parseHeader(arrayBuffer);
    let offset = header.headerEndOffset;

    const chunks = this.parseChunks(arrayBuffer, offset, header.chunkCount);
    offset += header.chunkCount * 18 * 4; // 18 floats per chunk

    const data = this.unpackVertices(arrayBuffer, offset, header.vertexCount, chunks);
    rotateZ180(data);
    console.log(`Loaded ${data.count} splats from ${url}`);
    return data;
  }

  private parseHeader(arrayBuffer: ArrayBuffer): PLYHeader {
    const decoder = new TextDecoder('utf-8');
    const headerBytes = new Uint8Array(arrayBuffer, 0, 2000); // Read first 2KB to find header
    const headerText = decoder.decode(headerBytes);

    const lines = headerText.split('\n');
    let chunkCount = 0;
    let vertexCount = 0;
    let shCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('element')) {
        const parts = trimmedLine.split(' ');
        const currentElement = parts[1];
        const countStr = parts[2];
        if (!currentElement || !countStr) continue;
        const count = parseInt(countStr);

        if (currentElement === 'chunk') {
          chunkCount = count;
        } else if (currentElement === 'vertex') {
          vertexCount = count;
        } else if (currentElement === 'sh') {
          shCount = count;
        }
      }

      if (trimmedLine === 'end_header') {
        const headerEndOffset = headerText.indexOf('end_header') + 'end_header\n'.length;
        return { chunkCount, vertexCount, shCount, headerEndOffset };
      }
    }

    throw new Error('Invalid PLY header');
  }

  private parseChunks(arrayBuffer: ArrayBuffer, offset: number, count: number): ChunkMetadata[] {
    const view = new DataView(arrayBuffer);
    const chunks: ChunkMetadata[] = [];

    for (let i = 0; i < count; i++) {
      const chunkOffset = offset + i * 18 * 4; // 18 floats per chunk
      chunks.push({
        minX: view.getFloat32(chunkOffset + 0, true),
        minY: view.getFloat32(chunkOffset + 4, true),
        minZ: view.getFloat32(chunkOffset + 8, true),
        maxX: view.getFloat32(chunkOffset + 12, true),
        maxY: view.getFloat32(chunkOffset + 16, true),
        maxZ: view.getFloat32(chunkOffset + 20, true),
        minScaleX: view.getFloat32(chunkOffset + 24, true),
        minScaleY: view.getFloat32(chunkOffset + 28, true),
        minScaleZ: view.getFloat32(chunkOffset + 32, true),
        maxScaleX: view.getFloat32(chunkOffset + 36, true),
        maxScaleY: view.getFloat32(chunkOffset + 40, true),
        maxScaleZ: view.getFloat32(chunkOffset + 44, true),
        minR: view.getFloat32(chunkOffset + 48, true),
        minG: view.getFloat32(chunkOffset + 52, true),
        minB: view.getFloat32(chunkOffset + 56, true),
        maxR: view.getFloat32(chunkOffset + 60, true),
        maxG: view.getFloat32(chunkOffset + 64, true),
        maxB: view.getFloat32(chunkOffset + 68, true),
      });
    }

    return chunks;
  }

  private unpackVertices(
    arrayBuffer: ArrayBuffer,
    offset: number,
    count: number,
    chunks: ChunkMetadata[]
  ): SplatData {
    const view = new DataView(arrayBuffer);
    const data = createSplatData(count);
    const { positions, rotations, scales, colors } = data;

    for (let i = 0; i < count; i++) {
      // splats are grouped in fixed chunks of 256
      const chunk = chunks[Math.floor(i / CHUNK_SIZE)];
      if (!chunk) throw new Error(`Missing chunk for vertex ${i}`);

      const vertexOffset = offset + i * 16; // 4 uint32 per vertex
      const packedPosition = view.getUint32(vertexOffset, true);
      const packedRotation = view.getUint32(vertexOffset + 4, true);
      const packedScale = view.getUint32(vertexOffset + 8, true);
      const packedColor = view.getUint32(vertexOffset + 12, true);

      // Unpack position (11/10/11 bits, normalized to chunk bounds)
      const [px, py, pz] = unpack111011(packedPosition);
      positions[i * 3] = chunk.minX + px * (chunk.maxX - chunk.minX);
      positions[i * 3 + 1] = chunk.minY + py * (chunk.maxY - chunk.minY);
      positions[i * 3 + 2] = chunk.minZ + pz * (chunk.maxZ - chunk.minZ);

      // Unpack rotation: smallest-three encoding of quaternion (w, x, y, z).
      // top 2 bits = index of the dropped (largest) component, others 10 bits each
      const norm = Math.SQRT2;
      const qa = (((packedRotation >>> 20) & 0x3FF) / 1023.0 - 0.5) * norm;
      const qb = (((packedRotation >>> 10) & 0x3FF) / 1023.0 - 0.5) * norm;
      const qc = ((packedRotation & 0x3FF) / 1023.0 - 0.5) * norm;
      const qm = Math.sqrt(Math.max(0, 1.0 - qa * qa - qb * qb - qc * qc));

      let q: [number, number, number, number];
      switch (packedRotation >>> 30) {
        case 0: q = [qm, qa, qb, qc]; break;
        case 1: q = [qa, qm, qb, qc]; break;
        case 2: q = [qa, qb, qm, qc]; break;
        default: q = [qa, qb, qc, qm]; break;
      }
      // store as (x, y, z, w)
      rotations[i * 4] = q[1];
      rotations[i * 4 + 1] = q[2];
      rotations[i * 4 + 2] = q[3];
      rotations[i * 4 + 3] = q[0];

      // Unpack scale (11/10/11 bits, log space within chunk range)
      const [sx, sy, sz] = unpack111011(packedScale);
      scales[i * 3] = Math.exp(chunk.minScaleX + sx * (chunk.maxScaleX - chunk.minScaleX));
      scales[i * 3 + 1] = Math.exp(chunk.minScaleY + sy * (chunk.maxScaleY - chunk.minScaleY));
      scales[i * 3 + 2] = Math.exp(chunk.minScaleZ + sz * (chunk.maxScaleZ - chunk.minScaleZ));

      // Unpack color and opacity
      const cr = ((packedColor >>> 24) & 0xFF) / 255.0;
      const cg = ((packedColor >>> 16) & 0xFF) / 255.0;
      const cb = ((packedColor >>> 8) & 0xFF) / 255.0;
      colors[i * 4] = chunk.minR + cr * (chunk.maxR - chunk.minR);
      colors[i * 4 + 1] = chunk.minG + cg * (chunk.maxG - chunk.minG);
      colors[i * 4 + 2] = chunk.minB + cb * (chunk.maxB - chunk.minB);
      colors[i * 4 + 3] = (packedColor & 0xFF) / 255.0;
    }

    return data;
  }
}
