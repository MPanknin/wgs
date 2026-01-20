import type { Camera } from './Camera';

export class CameraControl {
  private isDragging = false;
  private isPanning = false;
  private lastX = 0;
  private lastY = 0;
  private distance: number;
  private theta = 0; // horizontal rotation
  private phi = 0; // vertical rotation

  constructor(
    private camera: Camera,
    private element: HTMLElement,
    distance?: number
  ) {
    // initial theta, phi, and distance from current camera position
    const dx = this.camera.position[0] - this.camera.target[0];
    const dy = this.camera.position[1] - this.camera.target[1];
    const dz = this.camera.position[2] - this.camera.target[2];

    this.distance = distance ?? Math.sqrt(dx * dx + dy * dy + dz * dz);

    // initial spherical coordinates from camera position
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    this.theta = Math.atan2(dx, dz);
    this.phi = Math.atan2(dy, horizontalDist);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.element.addEventListener('mousedown', this.onMouseDown);
    this.element.addEventListener('mousemove', this.onMouseMove);
    this.element.addEventListener('mouseup', this.onMouseUp);
    this.element.addEventListener('mouseleave', this.onMouseUp);
    this.element.addEventListener('wheel', this.onWheel);
    this.element.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      // Left mouse button - rotate
      this.isDragging = true;
    } else if (e.button === 2) {
      // Right mouse button - pan
      this.isPanning = true;
      e.preventDefault();
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging && !this.isPanning) return;

    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;

    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.isDragging) {
      // rotate camera
      this.theta -= deltaX * 0.01;
      this.phi += deltaY * 0.01; // inverted: positive deltaY (drag down) increases phi (camera goes up)

      // clamp vertical rotation
      this.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.phi));
    } else if (this.isPanning) {
      // pan camera in screen space
      const panSpeed = 0.005 * this.distance;

      // calculate camera direction vector
      const dirX = this.camera.target[0] - this.camera.position[0];
      const dirY = this.camera.target[1] - this.camera.position[1];
      const dirZ = this.camera.target[2] - this.camera.position[2];

      // normalize direction
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
      const dirNormX = dirX / dirLen;
      const dirNormY = dirY / dirLen;
      const dirNormZ = dirZ / dirLen;

      // calculate right vector (cross product of direction and world up)
      const worldUp = [0, 1, 0];
      const rightX = dirNormY * worldUp[2] - dirNormZ * worldUp[1];
      const rightY = dirNormZ * worldUp[0] - dirNormX * worldUp[2];
      const rightZ = dirNormX * worldUp[1] - dirNormY * worldUp[0];

      // normalize right vector
      const rightLen = Math.sqrt(rightX * rightX + rightY * rightY + rightZ * rightZ);
      const rightNormX = rightX / rightLen;
      const rightNormY = rightY / rightLen;
      const rightNormZ = rightZ / rightLen;

      // calculate up vector (cross product of right and direction)
      const upX = rightNormY * dirNormZ - rightNormZ * dirNormY;
      const upY = rightNormZ * dirNormX - rightNormX * dirNormZ;
      const upZ = rightNormX * dirNormY - rightNormY * dirNormX;

      // update target position based on screen-space pan
      this.camera.target[0] -= rightNormX * deltaX * panSpeed - upX * deltaY * panSpeed;
      this.camera.target[1] -= rightNormY * deltaX * panSpeed - upY * deltaY * panSpeed;
      this.camera.target[2] -= rightNormZ * deltaX * panSpeed - upZ * deltaY * panSpeed;
    }

    this.updateCameraPosition();
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
    this.isPanning = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    // zoom
    this.distance += e.deltaY * 0.01;
    this.distance = Math.max(1, Math.min(50, this.distance));

    this.updateCameraPosition();
  };

  private updateCameraPosition(): void {
    
    // spherical coordinates to cartesian
    const x = this.distance * Math.cos(this.phi) * Math.sin(this.theta);
    const y = this.distance * Math.sin(this.phi);
    const z = this.distance * Math.cos(this.phi) * Math.cos(this.theta);

    this.camera.position = [
      this.camera.target[0] + x,
      this.camera.target[1] + y,
      this.camera.target[2] + z,
    ];

    this.camera.updateMatrices();
  }

  destroy(): void {
    this.element.removeEventListener('mousedown', this.onMouseDown);
    this.element.removeEventListener('mousemove', this.onMouseMove);
    this.element.removeEventListener('mouseup', this.onMouseUp);
    this.element.removeEventListener('mouseleave', this.onMouseUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
  }
}
