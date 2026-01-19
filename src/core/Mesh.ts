import type { Material } from './Material';

export interface MeshDescriptor {
  vertices: Float32Array;
  indices?: Uint16Array;
}

export interface Mesh {
  material?: Material;
  destroy(): void;
}
