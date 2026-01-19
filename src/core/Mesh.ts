import type { Material } from './Material';
import { Object3D } from './Object3D';

export interface MeshDescriptor {
  vertices: Float32Array;
  indices?: Uint16Array;
}

export abstract class Mesh extends Object3D {
  material?: Material;

  abstract destroy(): void;
}
