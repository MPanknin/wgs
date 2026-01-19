import { mat4 } from 'gl-matrix';
import type { Vec3 } from '../utils/Math';
import { createModelMatrix } from '../utils/Math';

export type Quaternion = [number, number, number, number]; // [x, y, z, w]

export class Object3D {
  position: Vec3 = [0, 0, 0];
  rotation: Quaternion = [0, 0, 0, 1]; // Identity quaternion
  scale: Vec3 = [1, 1, 1];

  parent: Object3D | null = null;
  children: Object3D[] = [];

  localMatrix: Float32Array = new Float32Array(16);
  worldMatrix: Float32Array = new Float32Array(16);

  private matrixNeedsUpdate = true;

  constructor() {
    this.updateMatrixWorld();
  }

  addChild(child: Object3D): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
  }

  removeChild(child: Object3D): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }

  updateMatrixWorld(force = false): void {
    if (this.matrixNeedsUpdate || force) {
      createModelMatrix(this.position, this.rotation, this.scale, this.localMatrix);
      this.matrixNeedsUpdate = false;
    }

    if (this.parent) {
      mat4.multiply(this.worldMatrix, this.parent.worldMatrix, this.localMatrix);
    } else {
      this.worldMatrix.set(this.localMatrix);
    }

    for (const child of this.children) {
      child.updateMatrixWorld(force);
    }
  }

  markMatrixDirty(): void {
    this.matrixNeedsUpdate = true;
  }
}
