import type { Material } from './Material';
import { Object3D } from './Object3D';
import type { Vec3 } from '../utils/Math';

export interface InstancedMeshDescriptor {
  vertices: Float32Array;
  indices?: Uint16Array;
  material?: Material;
  instanceCount: number;
}

export interface InstanceData {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion (x, y, z, w)
  scale: [number, number, number];
  color: [number, number, number];
  opacity: number;
}

export class InstancedMesh extends Object3D {
  vertices: Float32Array;
  indices?: Uint16Array;
  material?: Material;
  instanceCount: number;
  instanceData: Float32Array; // interleaved: [pos.xyz, rot.xyzw, scale.xyz, color.rgb, opacity] per instance

  // sorting state
  needsBufferUpdate: boolean = false;
  lastCameraPosition: Vec3 = [0, 0, 0];
  private sortThreshold: number = 0.1; // minimum camera movement to trigger re-sort

  constructor(descriptor: InstancedMeshDescriptor) {
    super();
    this.vertices = descriptor.vertices;
    this.indices = descriptor.indices;
    this.material = descriptor.material;
    this.instanceCount = descriptor.instanceCount;

    // instance data buffer: 14 floats per instance (pos:3, rot:4, scale:3, color:3, opacity:1)
    this.instanceData = new Float32Array(this.instanceCount * 14);
  }

  setInstanceData(index: number, data: InstanceData): void {
    const offset = index * 14;

    this.instanceData[offset + 0] = data.position[0];
    this.instanceData[offset + 1] = data.position[1];
    this.instanceData[offset + 2] = data.position[2];

    this.instanceData[offset + 3] = data.rotation[0];
    this.instanceData[offset + 4] = data.rotation[1];
    this.instanceData[offset + 5] = data.rotation[2];
    this.instanceData[offset + 6] = data.rotation[3];

    this.instanceData[offset + 7] = data.scale[0];
    this.instanceData[offset + 8] = data.scale[1];
    this.instanceData[offset + 9] = data.scale[2];

    this.instanceData[offset + 10] = data.color[0];
    this.instanceData[offset + 11] = data.color[1];
    this.instanceData[offset + 12] = data.color[2];

    this.instanceData[offset + 13] = data.opacity;
  }

  shouldSort(cameraPosition: Vec3): boolean {
    const dx = cameraPosition[0] - this.lastCameraPosition[0];
    const dy = cameraPosition[1] - this.lastCameraPosition[1];
    const dz = cameraPosition[2] - this.lastCameraPosition[2];
    const distanceMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return distanceMoved > this.sortThreshold;
  }

  sortInstances(cameraPosition: Vec3): void {
    const floatsPerInstance = 14;

    // squared distances from camera for all instances
    const depths = new Float32Array(this.instanceCount);
    for (let i = 0; i < this.instanceCount; i++) {
      const offset = i * floatsPerInstance;
      const px = this.instanceData[offset + 0];
      const py = this.instanceData[offset + 1];
      const pz = this.instanceData[offset + 2];

      const dx = px - cameraPosition[0];
      const dy = py - cameraPosition[1];
      const dz = pz - cameraPosition[2];

      depths[i] = dx * dx + dy * dy + dz * dz; // squared distance
    }

    // indices array and sort by depth (back to front for alpha blending)
    const indices = Array.from({ length: this.instanceCount }, (_, i) => i);
    indices.sort((a, b) => depths[b]! - depths[a]!); // sort descending (far to near)

    // reorder instanceData in-place using a temporary buffer
    const temp = new Float32Array(this.instanceCount * floatsPerInstance);
    temp.set(this.instanceData);

    for (let i = 0; i < this.instanceCount; i++) {
      const srcOffset = indices[i]! * floatsPerInstance;
      const dstOffset = i * floatsPerInstance;

      for (let j = 0; j < floatsPerInstance; j++) {
        this.instanceData[dstOffset + j] = temp[srcOffset + j];
      }
    }

    // update tracking state
    this.lastCameraPosition[0] = cameraPosition[0];
    this.lastCameraPosition[1] = cameraPosition[1];
    this.lastCameraPosition[2] = cameraPosition[2];
    this.needsBufferUpdate = true;
  }
}
