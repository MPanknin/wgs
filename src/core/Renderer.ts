import type { Scene } from './Scene';
import type { Camera } from './Camera';
import type { BufferDescriptor, Buffer } from './Buffer';
import type { ShaderDescriptor, Shader } from './Shader';
import type { MeshDescriptor, Mesh } from './Mesh';

export interface Renderer {
  createBuffer(descriptor: BufferDescriptor): Buffer;
  createShader(descriptor: ShaderDescriptor): Shader;
  createMesh(descriptor: MeshDescriptor): Mesh;
  render(scene: Scene, camera: Camera): void;
  clear(r: number, g: number, b: number, a: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
