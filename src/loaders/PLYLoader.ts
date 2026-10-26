import type { GaussianSplat } from '../data';

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

export class PLYLoader {
  async load(url: string): Promise<GaussianSplat[]> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    // Parse header
    const header = this.parseHeader(arrayBuffer);
    console.log('PLY Header:', header);

    // Parse binary data
    let offset = header.headerEndOffset;

    // Read chunk metadata
    const chunks = this.parseChunks(arrayBuffer, offset, header.chunkCount);
    console.log(`Loaded ${chunks.length} chunks`);
    offset += header.chunkCount * 18 * 4; // 18 floats per chunk

    // Read vertex data
    const vertices = this.parseVertices(arrayBuffer, offset, header.vertexCount);
    console.log(`Loaded ${vertices.length} vertices`);
    offset += header.vertexCount * 4 * 4; // 4 uint32 per vertex

    // Read SH data
    const shData = this.parseSH(arrayBuffer, offset, header.shCount);
    console.log(`Loaded ${shData.length} SH entries`);

    // Unpack and combine data
    const splats = this.unpackSplats(vertices, shData, chunks);
    console.log(`Unpacked ${splats.length} splats`);

    return splats;
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

  private parseVertices(arrayBuffer: ArrayBuffer, offset: number, count: number): Uint32Array[] {
    const view = new DataView(arrayBuffer);
    const vertices: Uint32Array[] = [];

    for (let i = 0; i < count; i++) {
      const vertexOffset = offset + i * 16; // 4 uint32 per vertex
      vertices.push(new Uint32Array([
        view.getUint32(vertexOffset + 0, true),  // packed_position
        view.getUint32(vertexOffset + 4, true),  // packed_rotation
        view.getUint32(vertexOffset + 8, true),  // packed_scale
        view.getUint32(vertexOffset + 12, true), // packed_color
      ]));
    }

    return vertices;
  }

  private parseSH(arrayBuffer: ArrayBuffer, offset: number, count: number): Uint8Array[] {
    const shData: Uint8Array[] = [];

    for (let i = 0; i < count; i++) {
      const shOffset = offset + i * 45; // 45 uchar per SH entry
      shData.push(new Uint8Array(arrayBuffer, shOffset, 45));
    }

    return shData;
  }

  private unpackSplats(
    vertices: Uint32Array[],
    shData: Uint8Array[],
    chunks: ChunkMetadata[]
  ): GaussianSplat[] {
    const splats: GaussianSplat[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const vertex = vertices[i];
      if (!vertex) continue;

      // splats are grouped in fixed chunks of 256
      const chunk = chunks[Math.floor(i / CHUNK_SIZE)];
      if (!chunk) continue;

      // Unpack position (11/10/11 bits, normalized to chunk bounds)
      const [px, py, pz] = unpack111011(vertex[0]!);

      const position: [number, number, number] = [
        chunk.minX + px * (chunk.maxX - chunk.minX),
        chunk.minY + py * (chunk.maxY - chunk.minY),
        chunk.minZ + pz * (chunk.maxZ - chunk.minZ),
      ];

      // flip x/y (180° about z) to convert from the y-down capture convention
      position[0] = -position[0];
      position[1] = -position[1];

      // Unpack rotation: smallest-three encoding of quaternion (w, x, y, z).
      // top 2 bits = index of the dropped (largest) component, others 10 bits each
      const packedRot = vertex[1]!;
      const norm = Math.SQRT2;
      const qa = (((packedRot >>> 20) & 0x3FF) / 1023.0 - 0.5) * norm;
      const qb = (((packedRot >>> 10) & 0x3FF) / 1023.0 - 0.5) * norm;
      const qc = ((packedRot & 0x3FF) / 1023.0 - 0.5) * norm;
      const qm = Math.sqrt(Math.max(0, 1.0 - qa * qa - qb * qb - qc * qc));

      let q: [number, number, number, number];
      switch (packedRot >>> 30) {
        case 0: q = [qm, qa, qb, qc]; break;
        case 1: q = [qa, qm, qb, qc]; break;
        case 2: q = [qa, qb, qm, qc]; break;
        default: q = [qa, qb, qc, qm]; break;
      }
      const [qw, qx, qy, qz] = q;

      // apply the same 180° z rotation as the position flip (qFlip * q),
      // output as (x, y, z, w) for the shader
      const rotation: [number, number, number, number] = [-qy, qx, qw, -qz];

      // Unpack scale (11/10/11 bits, log space within chunk range)
      const [sx, sy, sz] = unpack111011(vertex[2]!);

      const scale: [number, number, number] = [
        Math.exp(chunk.minScaleX + sx * (chunk.maxScaleX - chunk.minScaleX)),
        Math.exp(chunk.minScaleY + sy * (chunk.maxScaleY - chunk.minScaleY)),
        Math.exp(chunk.minScaleZ + sz * (chunk.maxScaleZ - chunk.minScaleZ)),
      ];

      // Unpack color and opacity
      const packedColor = vertex[3]!;
      const cr = ((packedColor >>> 24) & 0xFF) / 255.0;
      const cg = ((packedColor >>> 16) & 0xFF) / 255.0;
      const cb = ((packedColor >>> 8) & 0xFF) / 255.0;
      const opacity = (packedColor & 0xFF) / 255.0;

      const color: [number, number, number] = [
        chunk.minR + cr * (chunk.maxR - chunk.minR),
        chunk.minG + cg * (chunk.maxG - chunk.minG),
        chunk.minB + cb * (chunk.maxB - chunk.minB),
      ];

      // Convert SH from uchar to float (quantized to [-4, 4])
      let shFloat: Float32Array | undefined;
      const sh = shData[i];
      if (sh) {
        shFloat = new Float32Array(45);
        for (let j = 0; j < 45; j++) {
          const v = sh[j]!;
          shFloat[j] = v === 0 ? 0 : ((v + 0.5) / 256.0 - 0.5) * 8.0;
        }
      }

      splats.push({
        position,
        rotation,
        scale,
        color,
        opacity,
        sh: shFloat,
      });
    }

    return splats;
  }
}
