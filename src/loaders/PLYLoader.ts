import type { GaussianSplat } from '../Data';

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
      const sh = shData[i];
      if (!vertex || !sh) continue;

      // Determine which chunk this vertex belongs to
      const chunkIndex = Math.floor(i / (vertices.length / chunks.length));
      const chunk = chunks[Math.min(chunkIndex, chunks.length - 1)];
      if (!chunk) continue;

      // Unpack position (normalized 0-1 to chunk bounds)
      const packedPos = vertex[0]!;
      const px = ((packedPos >>> 21) & 0x7FF) / 2047.0;
      const py = ((packedPos >>> 10) & 0x7FF) / 2047.0;
      const pz = (packedPos & 0x3FF) / 1023.0;

      const position: [number, number, number] = [
        chunk.minX + px * (chunk.maxX - chunk.minX),
        chunk.minY + py * (chunk.maxY - chunk.minY),
        chunk.minZ + pz * (chunk.maxZ - chunk.minZ),
      ];

      // Unpack rotation (quaternion from packed uint32)
      const packedRot = vertex[1]!;
      const largestComponent = (packedRot >>> 30) & 0x3;
      const qa = (((packedRot >>> 20) & 0x3FF) / 1023.0) * 2.0 - 1.0;
      const qb = (((packedRot >>> 10) & 0x3FF) / 1023.0) * 2.0 - 1.0;
      const qc = ((packedRot & 0x3FF) / 1023.0) * 2.0 - 1.0;
      const qd = Math.sqrt(Math.max(0, 1.0 - qa * qa - qb * qb - qc * qc));

      let rotation: [number, number, number, number];
      if (largestComponent === 0) rotation = [qd, qa, qb, qc];
      else if (largestComponent === 1) rotation = [qa, qd, qb, qc];
      else if (largestComponent === 2) rotation = [qa, qb, qd, qc];
      else rotation = [qa, qb, qc, qd];

      // Unpack scale
      const packedScale = vertex[2]!;
      const sx = ((packedScale >>> 21) & 0x7FF) / 2047.0;
      const sy = ((packedScale >>> 10) & 0x7FF) / 2047.0;
      const sz = (packedScale & 0x3FF) / 1023.0;

      const scale: [number, number, number] = [
        chunk.minScaleX + sx * (chunk.maxScaleX - chunk.minScaleX),
        chunk.minScaleY + sy * (chunk.maxScaleY - chunk.minScaleY),
        chunk.minScaleZ + sz * (chunk.maxScaleZ - chunk.minScaleZ),
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

      // Convert SH from uchar to float
      const shFloat = new Float32Array(45);
      for (let j = 0; j < 45; j++) {
        shFloat[j] = ((sh[j] || 0) / 255.0) * 2.0 - 1.0; // Normalize to -1 to 1
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
