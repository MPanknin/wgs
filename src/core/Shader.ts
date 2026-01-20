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
  varying vec2 vUv;

  void main() {
    vColor = instanceColor;
    vOpacity = instanceOpacity;
    vUv = position.xy; 

    vec3 scaledPos = position * instanceScale;
    vec3 worldPos = scaledPos + instancePosition;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

export const fragmentShaderWebGLInstanced = `
  precision mediump float;
  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vUv;

  void main() {
    // convert uv from -0.5..0.5 to -1..1
    vec2 centered = vUv * 2.0;

    // dist squared from center
    float distSq = dot(centered, centered);

    // gaussian falloff: exp(-0.5 * r^2)
    float gaussian = exp(-0.5 * distSq);
    float alpha = gaussian * vOpacity;

    // sanity discard
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
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
    @location(2) uv: vec2f,
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
    output.uv = position.xy; // Position is -0.5 to 0.5 for quad

    return output;
  }
`;

export const fragmentShaderWebGPUInstanced = `
  @fragment
  fn fragmentMain(
    @location(0) color: vec3f,
    @location(1) opacity: f32,
    @location(2) uv: vec2f
  ) -> @location(0) vec4f {
    // convert uv from -0.5..0.5 to -1..1
    let centered = uv * 2.0;

    // dist squared from center
    let distSq = dot(centered, centered);

    // gaussian falloff: exp(-0.5 * r^2)
    let gaussian = exp(-0.5 * distSq);
    let alpha = gaussian * opacity;

    // sanity discard
    if (alpha < 0.01) {
      discard;
    }

    return vec4f(color, alpha);
  }
`;

