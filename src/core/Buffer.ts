export interface BufferDescriptor {
  data: Float32Array | Uint16Array;
  usage: 'vertex' | 'index';
}

export interface Buffer {
  destroy(): void;
}
