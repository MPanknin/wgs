import type { Shader } from './Shader';
import type { Vec3 } from '../utils/Math';

export interface Material {
  shader: Shader;
  color?: Vec3;
  opacity?: number;
}
