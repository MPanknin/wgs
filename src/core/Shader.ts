export interface ShaderDescriptor {
  vertex: string;
  fragment: string;
}

export interface Shader {
  destroy(): void;
}

export const vertexShaderWebGL = `
  attribute vec3 position;
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

export const fragmentShaderWebGL = `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
`;

export const vertexShaderWebGPU = `
  @vertex
  fn vertexMain(@location(0) position: vec3f) -> @builtin(position) vec4f {
    return vec4f(position, 1.0);
  }
`;

export const fragmentShaderWebGPU = `
  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 0.0, 1.0);
  }
`;

