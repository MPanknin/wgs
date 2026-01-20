import type { Shader } from './Shader';
import type { Vec3 } from '../utils/Math';

export interface MaterialDescriptor {
  shader: Shader;
  color?: Vec3;
  opacity?: number;
}

export class Material {
  shader: Shader;
  color: Vec3;
  opacity: number;

  constructor(descriptor: MaterialDescriptor) {
    this.shader = descriptor.shader;
    this.color = descriptor.color || [1, 1, 1];
    this.opacity = descriptor.opacity ?? 1.0;
  }
}
