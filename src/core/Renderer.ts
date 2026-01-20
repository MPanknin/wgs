import type { Scene } from './Scene';
import type { Camera } from './Camera';

export interface Renderer {
  render(scene: Scene, camera: Camera): void;
  clear(r: number, g: number, b: number, a: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
