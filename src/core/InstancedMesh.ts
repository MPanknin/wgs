import type { Material } from './Material';
import { Object3D } from './Object3D';

export interface InstancedMeshDescriptor {
  vertices: Float32Array;
  indices?: Uint16Array;
  material?: Material;
  instanceCount: number;
}

export interface InstanceData {
  position: [number, number, number];
  scale: [number, number, number];
  color: [number, number, number];
  opacity: number;
}

export class InstancedMesh extends Object3D {
  vertices: Float32Array;
  indices?: Uint16Array;
  material?: Material;
  instanceCount: number;
  instanceData: Float32Array; // interleaved: [pos.xyz, scale.xyz, color.rgb, opacity] per instance

  constructor(descriptor: InstancedMeshDescriptor) {
    super();
    this.vertices = descriptor.vertices;
    this.indices = descriptor.indices;
    this.material = descriptor.material;
    this.instanceCount = descriptor.instanceCount;

    // instance data buffer: 10 floats per instance (pos:3, scale:3, color:3, opacity:1)
    this.instanceData = new Float32Array(this.instanceCount * 10);
  }

  setInstanceData(index: number, data: InstanceData): void {
    const offset = index * 10;

    this.instanceData[offset + 0] = data.position[0];
    this.instanceData[offset + 1] = data.position[1];
    this.instanceData[offset + 2] = data.position[2];

    this.instanceData[offset + 3] = data.scale[0];
    this.instanceData[offset + 4] = data.scale[1];
    this.instanceData[offset + 5] = data.scale[2];

    this.instanceData[offset + 6] = data.color[0];
    this.instanceData[offset + 7] = data.color[1];
    this.instanceData[offset + 8] = data.color[2];

    this.instanceData[offset + 9] = data.opacity;
  }
}
