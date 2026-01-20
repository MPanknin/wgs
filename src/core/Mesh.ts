import type { Material } from './Material';
import { Object3D } from './Object3D';

export interface MeshDescriptor {
  vertices: Float32Array;
  indices?: Uint16Array;
  material?: Material;
}

export class Mesh extends Object3D {
  vertices: Float32Array;
  indices?: Uint16Array;
  material?: Material;

  constructor(descriptor: MeshDescriptor) {
    super();
    this.vertices = descriptor.vertices;
    this.indices = descriptor.indices;
    this.material = descriptor.material;
  }
}
