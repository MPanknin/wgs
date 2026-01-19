import { mat4 } from 'gl-matrix';
import type { Vec3 } from '../utils/Math';

export class Camera {
  position: Vec3 = [0, 0, 5];
  target: Vec3 = [0, 0, 0];
  up: Vec3 = [0, 1, 0];

  fov: number = 60;
  aspect: number = 1;
  near: number = 0.1;
  far: number = 100;

  viewMatrix: Float32Array = new Float32Array(16);
  projectionMatrix: Float32Array = new Float32Array(16);

  constructor(aspect: number = 1) {
    this.aspect = aspect;
    this.updateMatrices();
  }

  updateMatrices(): void {
    this.updateViewMatrix();
    this.updateProjectionMatrix();
  }

  private updateViewMatrix(): void {
    mat4.lookAt(this.viewMatrix, this.position, this.target, this.up);
  }

  private updateProjectionMatrix(): void {
    const fovRad = (this.fov * Math.PI) / 180;
    mat4.perspective(this.projectionMatrix, fovRad, this.aspect, this.near, this.far);
  }
}
