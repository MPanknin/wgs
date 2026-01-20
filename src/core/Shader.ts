export interface ShaderDescriptor {
  vertex: string;
  fragment: string;
}

export class Shader {
  vertex: string;
  fragment: string;

  constructor(descriptor: ShaderDescriptor) {
    this.vertex = descriptor.vertex;
    this.fragment = descriptor.fragment;
  }
}

export const vertexShaderWebGL = `
  attribute vec3 position;
  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  void main() {
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShaderWebGL = `
  precision mediump float;
  uniform vec3 color;
  uniform float opacity;
  void main() {
    gl_FragColor = vec4(color, opacity);
  }
`;

export const vertexShaderWebGPU = `
  struct Uniforms {
    modelMatrix: mat4x4f,
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    color: vec3f,
    opacity: f32,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn vertexMain(@location(0) position: vec3f) -> @builtin(position) vec4f {
    return uniforms.projectionMatrix * uniforms.viewMatrix * uniforms.modelMatrix * vec4f(position, 1.0);
  }
`;

export const fragmentShaderWebGPU = `
  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4f(uniforms.color, uniforms.opacity);
  }
`;

export const vertexShaderWebGLInstanced = `
  attribute vec3 position;
  attribute vec3 instancePosition;
  attribute vec3 instanceScale;
  attribute vec3 instanceColor;
  attribute float instanceOpacity;

  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;

  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vColor = instanceColor;
    vOpacity = instanceOpacity;

    vec3 scaledPos = position * instanceScale;
    vec3 worldPos = scaledPos + instancePosition;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

export const fragmentShaderWebGLInstanced = `
  precision mediump float;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    gl_FragColor = vec4(vColor, vOpacity);
  }
`;

export const vertexShaderWebGPUInstanced = `
  struct Uniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
    @location(1) opacity: f32,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn vertexMain(
    @location(0) position: vec3f,
    @location(1) instancePosition: vec3f,
    @location(2) instanceScale: vec3f,
    @location(3) instanceColor: vec3f,
    @location(4) instanceOpacity: f32
  ) -> VertexOutput {
    var output: VertexOutput;

    let scaledPos = position * instanceScale;
    let worldPos = scaledPos + instancePosition;

    output.position = uniforms.projectionMatrix * uniforms.viewMatrix * vec4f(worldPos, 1.0);
    output.color = instanceColor;
    output.opacity = instanceOpacity;

    return output;
  }
`;

export const fragmentShaderWebGPUInstanced = `
  @fragment
  fn fragmentMain(
    @location(0) color: vec3f,
    @location(1) opacity: f32
  ) -> @location(0) vec4f {
    return vec4f(color, opacity);
  }
`;

