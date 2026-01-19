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
      multiplyMatrices(this.parent.worldMatrix, this.localMatrix, this.worldMatrix);
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

function multiplyMatrices(a: Float32Array, b: Float32Array, out: Float32Array): void {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;

  const b00 = b[0]!, b01 = b[1]!, b02 = b[2]!, b03 = b[3]!;
  const b10 = b[4]!, b11 = b[5]!, b12 = b[6]!, b13 = b[7]!;
  const b20 = b[8]!, b21 = b[9]!, b22 = b[10]!, b23 = b[11]!;
  const b30 = b[12]!, b31 = b[13]!, b32 = b[14]!, b33 = b[15]!;

  out[0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
  out[1] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
  out[2] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
  out[3] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;

  out[4] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
  out[5] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
  out[6] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
  out[7] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;

  out[8] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
  out[9] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
  out[10] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
  out[11] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;

  out[12] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
  out[13] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
  out[14] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
  out[15] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;
}
