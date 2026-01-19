export interface ShaderDescriptor {
  vertex: string;
  fragment: string;
}

export interface Shader {
  destroy(): void;
}

export const vertexShaderWebGL = `
  attribute vec3 position;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  void main() {
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShaderWebGL = `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
`;

export const vertexShaderWebGPU = `
  struct Uniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
  };

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn vertexMain(@location(0) position: vec3f) -> @builtin(position) vec4f {
    return uniforms.projectionMatrix * uniforms.viewMatrix * vec4f(position, 1.0);
  }
`;

export const fragmentShaderWebGPU = `
  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 0.0, 1.0);
  }
`;

