import type { Camera } from './Camera';

export class CameraControl {
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;
  private distance = 5;
  private theta = 0; // horizontal rotation
  private phi = 0; // vertical rotation

  constructor(
    private camera: Camera,
    private element: HTMLElement
  ) {
    this.updateCameraPosition();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.element.addEventListener('mousedown', this.onMouseDown);
    this.element.addEventListener('mousemove', this.onMouseMove);
    this.element.addEventListener('mouseup', this.onMouseUp);
    this.element.addEventListener('mouseleave', this.onMouseUp);
    this.element.addEventListener('wheel', this.onWheel);
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;

    this.lastX = e.clientX;
    this.lastY = e.clientY;

    // rotate camera
    this.theta -= deltaX * 0.01;
    this.phi -= deltaY * 0.01;

    // clamp vertical rotation
    this.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.phi));

    this.updateCameraPosition();
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
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
  }
}
