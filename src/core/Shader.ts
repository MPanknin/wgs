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
  uniform vec2 viewport;

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

    // Build rotation matrix from quaternion
    mat3 R = quatToMat3(instanceRotation);

    // Build scale matrix
    mat3 S = mat3(
      instanceScale.x, 0.0, 0.0,
      0.0, instanceScale.y, 0.0,
      0.0, 0.0, instanceScale.z
    );

    // Compute 3D covariance: Vrk = R * S * S^T * R^T
    mat3 RS = R * S;
    mat3 Vrk = RS * transpose3(RS);

    // Transform splat center to view space
    vec4 viewCenter = viewMatrix * vec4(instancePosition, 1.0);
    vec3 cam = viewCenter.xyz;

    // Jacobian of perspective projection
    // Convert focal from NDC to pixel space
    vec2 focal = vec2(
      projectionMatrix[0][0] * viewport.x * 0.5,
      projectionMatrix[1][1] * viewport.y * 0.5
    );
    mat3 J = mat3(
      focal.x / cam.z, 0.0, -(focal.x * cam.x) / (cam.z * cam.z),
      0.0, -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
      0.0, 0.0, 0.0
    );

    // Transform to view space and project to 2D
    mat3 W = mat3(viewMatrix[0].xyz, viewMatrix[1].xyz, viewMatrix[2].xyz);
    mat3 T = W * J;
    mat3 cov2d = transpose3(T) * Vrk * T;

    // Add small epsilon for numerical stability
    cov2d[0][0] += 0.3;
    cov2d[1][1] += 0.3;

    // Compute eigenvalues for 2D covariance
    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius;
    float lambda2 = max(mid - radius, 0.1);

    // Eigenvectors
    vec2 v1 = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    vec2 v2 = vec2(-v1.y, v1.x);

    // Compute conic (inverse of 2D covariance) for fragment shader
    float det = cov2d[0][0] * cov2d[1][1] - cov2d[0][1] * cov2d[0][1];
    float invDet = 1.0 / det;
    vConic = vec3(cov2d[1][1] * invDet, -cov2d[0][1] * invDet, cov2d[0][0] * invDet);

    // Compute ellipse axes (3-sigma coverage for 99.7% of Gaussian)
    vec2 majorAxis = min(3.0 * sqrt(lambda1), 1024.0) * v1;
    vec2 minorAxis = min(3.0 * sqrt(lambda2), 1024.0) * v2;

    // Project center to clip space
    vec4 clipCenter = projectionMatrix * viewCenter;
    vec2 ndcCenter = clipCenter.xy / clipCenter.w;

    // Position quad corner in NDC space
    // Convert from pixel space to NDC space (NDC spans -1 to 1, so divide by viewport/2)
    vec2 ndcOffset = (position.x * majorAxis + position.y * minorAxis) / (viewport * 0.5);
    vec2 ndcPos = ndcCenter + ndcOffset;

    gl_Position = vec4(ndcPos * clipCenter.w, clipCenter.z, clipCenter.w);
  }
`;

export const fragmentShaderWebGLInstanced = `
  precision highp float;
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
    viewport: vec2f,
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

    // Build rotation matrix from quaternion
    let R = quatToMat3(instanceRotation);

    // Build scale matrix
    let S = mat3x3f(
      instanceScale.x, 0.0, 0.0,
      0.0, instanceScale.y, 0.0,
      0.0, 0.0, instanceScale.z
    );

    // Compute 3D covariance: Vrk = R * S * S^T * R^T
    let RS = R * S;
    let Vrk = RS * transpose(RS);

    // Transform splat center to view space
    let viewCenter = uniforms.viewMatrix * vec4f(instancePosition, 1.0);
    let cam = viewCenter.xyz;

    // Jacobian of perspective projection
    // Convert focal from NDC to pixel space
    let focal = vec2f(
      uniforms.projectionMatrix[0][0] * uniforms.viewport.x * 0.5,
      uniforms.projectionMatrix[1][1] * uniforms.viewport.y * 0.5
    );
    let J = mat3x3f(
      focal.x / cam.z, 0.0, -(focal.x * cam.x) / (cam.z * cam.z),
      0.0, -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
      0.0, 0.0, 0.0
    );

    // Transform to view space and project to 2D
    let W = mat3x3f(uniforms.viewMatrix[0].xyz, uniforms.viewMatrix[1].xyz, uniforms.viewMatrix[2].xyz);
    let T = W * J;
    var cov2d = transpose(T) * Vrk * T;

    // Add small epsilon for numerical stability
    cov2d[0][0] += 0.3;
    cov2d[1][1] += 0.3;

    // Compute eigenvalues for 2D covariance
    let mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    let radius = length(vec2f((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    let lambda1 = mid + radius;
    let lambda2 = max(mid - radius, 0.1);

    // Eigenvectors
    let v1 = normalize(vec2f(cov2d[0][1], lambda1 - cov2d[0][0]));
    let v2 = vec2f(-v1.y, v1.x);

    // Compute conic (inverse of 2D covariance) for fragment shader
    let det = cov2d[0][0] * cov2d[1][1] - cov2d[0][1] * cov2d[0][1];
    let invDet = 1.0 / det;
    output.conic = vec3f(cov2d[1][1] * invDet, -cov2d[0][1] * invDet, cov2d[0][0] * invDet);

    // Compute ellipse axes (3-sigma coverage for 99.7% of Gaussian)
    let majorAxis = min(3.0 * sqrt(lambda1), 1024.0) * v1;
    let minorAxis = min(3.0 * sqrt(lambda2), 1024.0) * v2;

    // Project center to clip space
    let clipCenter = uniforms.projectionMatrix * viewCenter;
    let ndcCenter = clipCenter.xy / clipCenter.w;

    // Position quad corner in NDC space
    // Convert from pixel space to NDC space (NDC spans -1 to 1, so divide by viewport/2)
    let ndcOffset = (position.x * majorAxis + position.y * minorAxis) / (uniforms.viewport * 0.5);
    let ndcPos = ndcCenter + ndcOffset;

    output.position = vec4f(ndcPos * clipCenter.w, clipCenter.z, clipCenter.w);

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

