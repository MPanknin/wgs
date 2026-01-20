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
  attribute vec4 instanceRotation;
  attribute vec3 instanceScale;
  attribute vec3 instanceColor;
  attribute float instanceOpacity;

  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;

  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vUv;
  varying vec3 vConic;

  // transpose a 3x3 matrix
  mat3 transpose3(mat3 m) {
    return mat3(
      m[0][0], m[1][0], m[2][0],
      m[0][1], m[1][1], m[2][1],
      m[0][2], m[1][2], m[2][2]
    );
  }

  // quaternion to rotation matrix
  mat3 quatToMat3(vec4 q) {
    float x = q.x, y = q.y, z = q.z, w = q.w;

    float x2 = x + x, y2 = y + y, z2 = z + z;
    float xx = x * x2, xy = x * y2, xz = x * z2;
    float yy = y * y2, yz = y * z2, zz = z * z2;
    float wx = w * x2, wy = w * y2, wz = w * z2;

    return mat3(
      1.0 - (yy + zz), xy + wz, xz - wy,
      xy - wz, 1.0 - (xx + zz), yz + wx,
      xz + wy, yz - wx, 1.0 - (xx + yy)
    );
  }

  void main() {
    vColor = instanceColor;
    vOpacity = instanceOpacity;
    vUv = position.xy;

    // Simple identity conic (circular Gaussian)
    vConic = vec3(1.0, 0.0, 1.0);

    // Apply instance scale to quad vertex
    vec3 scaledPos = position * instanceScale;

    // Transform to world space
    vec4 worldPos = vec4(instancePosition + scaledPos, 1.0);

    // Transform to clip space
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const fragmentShaderWebGLInstanced = `
  precision mediump float;
  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vUv;
  varying vec3 vConic;

  void main() {
    // vUv is in -0.5..0.5, scale to -1..1
    vec2 d = vUv * 2.0;

    // evaluate 2D Gaussian using the conic (inverse covariance)
    // power = d^T * Sigma^-1 * d = A*x^2 + 2*B*xy + C*y^2
    float power = vConic.x * d.x * d.x + 2.0 * vConic.y * d.x * d.y + vConic.z * d.y * d.y;

    // gaussian falloff
    float gaussian = exp(-0.5 * power);
    float alpha = gaussian * vOpacity;

    // discard low alpha fragments
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
    @location(3) conic: vec3f,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  // quaternion to rotation matrix
  fn quatToMat3(q: vec4f) -> mat3x3f {
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;

    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;
    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;

    return mat3x3f(
      1.0 - (yy + zz), xy + wz, xz - wy,
      xy - wz, 1.0 - (xx + zz), yz + wx,
      xz + wy, yz - wx, 1.0 - (xx + yy)
    );
  }

  @vertex
  fn vertexMain(
    @location(0) position: vec3f,
    @location(1) instancePosition: vec3f,
    @location(2) instanceRotation: vec4f,
    @location(3) instanceScale: vec3f,
    @location(4) instanceColor: vec3f,
    @location(5) instanceOpacity: f32
  ) -> VertexOutput {
    var output: VertexOutput;

    output.color = instanceColor;
    output.opacity = instanceOpacity;
    output.uv = position.xy;

    // Simple identity conic (circular Gaussian)
    output.conic = vec3f(1.0, 0.0, 1.0);

    // Apply instance scale to quad vertex
    let scaledPos = position * instanceScale;

    // Transform to world space
    let worldPos = vec4f(instancePosition + scaledPos, 1.0);

    // Transform to clip space
    output.position = uniforms.projectionMatrix * uniforms.viewMatrix * worldPos;

    return output;
  }
`;

export const fragmentShaderWebGPUInstanced = `
  @fragment
  fn fragmentMain(
    @location(0) color: vec3f,
    @location(1) opacity: f32,
    @location(2) uv: vec2f,
    @location(3) conic: vec3f
  ) -> @location(0) vec4f {
    // uv is in -0.5..0.5, scale to -1..1
    let d = uv * 2.0;

    // evaluate 2D Gaussian using the conic (inverse covariance)
    // power = d^T * Sigma^-1 * d = A*x^2 + 2*B*xy + C*y^2
    let power = conic.x * d.x * d.x + 2.0 * conic.y * d.x * d.y + conic.z * d.y * d.y;

    // gaussian falloff
    let gaussian = exp(-0.5 * power);
    let alpha = gaussian * opacity;

    // discard low alpha fragments
    if (alpha < 0.01) {
      discard;
    }

    return vec4f(color, alpha);
  }
`;

