import { subtract, cross, dot, normalize, type Vec3 } from '../utils/Math';

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
    const eye = this.position;
    const center = this.target;
    const up = this.up;

    // camera basis vectors
    const zAxis = normalize(subtract(eye, center));
    const xAxis = normalize(cross(up, zAxis));
    const yAxis = cross(zAxis, xAxis);

    // view matrix
    this.viewMatrix[0] = xAxis[0];
    this.viewMatrix[1] = yAxis[0];
    this.viewMatrix[2] = zAxis[0];
    this.viewMatrix[3] = 0;

    this.viewMatrix[4] = xAxis[1];
    this.viewMatrix[5] = yAxis[1];
    this.viewMatrix[6] = zAxis[1];
    this.viewMatrix[7] = 0;

    this.viewMatrix[8] = xAxis[2];
    this.viewMatrix[9] = yAxis[2];
    this.viewMatrix[10] = zAxis[2];
    this.viewMatrix[11] = 0;

    this.viewMatrix[12] = -dot(xAxis, eye);
    this.viewMatrix[13] = -dot(yAxis, eye);
    this.viewMatrix[14] = -dot(zAxis, eye);
    this.viewMatrix[15] = 1;
  }

  private updateProjectionMatrix(): void {
    const fovRad = (this.fov * Math.PI) / 180;
    const f = 1.0 / Math.tan(fovRad / 2);
    const rangeInv = 1.0 / (this.near - this.far);

    this.projectionMatrix[0] = f / this.aspect;
    this.projectionMatrix[1] = 0;
    this.projectionMatrix[2] = 0;
    this.projectionMatrix[3] = 0;

    this.projectionMatrix[4] = 0;
    this.projectionMatrix[5] = f;
    this.projectionMatrix[6] = 0;
    this.projectionMatrix[7] = 0;

    this.projectionMatrix[8] = 0;
    this.projectionMatrix[9] = 0;
    this.projectionMatrix[10] = (this.near + this.far) * rangeInv;
    this.projectionMatrix[11] = -1;

    this.projectionMatrix[12] = 0;
    this.projectionMatrix[13] = 0;
    this.projectionMatrix[14] = this.near * this.far * rangeInv * 2;
    this.projectionMatrix[15] = 0;
  }
}
