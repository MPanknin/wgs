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

// Gaussian splat projection (EWA splatting, Zwicker et al. / Kerbl et al. 3DGS):
// 3D covariance Sigma = R S S^T R^T is projected to screen space as
// cov2d = J W Sigma W^T J^T, where W is the view rotation and J the Jacobian
// of the perspective projection at the splat center. The quad is stretched
// along the eigenvectors of cov2d to 3 sigma, and the fragment shader evaluates
// the gaussian with the inverse covariance (conic) in pixel space.

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
  varying vec2 vOffset; // pixel offset from splat center
  varying vec3 vConic;

  mat3 transpose3(mat3 m) {
    return mat3(
      m[0][0], m[1][0], m[2][0],
      m[0][1], m[1][1], m[2][1],
      m[0][2], m[1][2], m[2][2]
    );
  }

  // quaternion (x, y, z, w) to rotation matrix
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

    vec4 viewCenter = viewMatrix * vec4(instancePosition, 1.0);

    // cull splats behind the camera
    if (viewCenter.z > -0.01) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }

    // 3D covariance
    mat3 M = quatToMat3(normalize(instanceRotation)) * mat3(
      instanceScale.x, 0.0, 0.0,
      0.0, instanceScale.y, 0.0,
      0.0, 0.0, instanceScale.z
    );
    mat3 Sigma = M * transpose3(M);

    // Jacobian of the perspective projection (pixels, y up). Camera looks down -z,
    // so use tz = -z. Clamp x/y to slightly beyond the frustum to keep J stable.
    float tz = -viewCenter.z;
    vec2 focal = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * viewport * 0.5;
    vec2 lim = 1.3 / vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
    vec2 txy = clamp(viewCenter.xy / tz, -lim, lim) * tz;

    mat3 J = mat3(
      focal.x / tz, 0.0, 0.0,
      0.0, focal.y / tz, 0.0,
      focal.x * txy.x / (tz * tz), focal.y * txy.y / (tz * tz), 0.0
    );
    mat3 W = mat3(viewMatrix[0].xyz, viewMatrix[1].xyz, viewMatrix[2].xyz);
    mat3 T = J * W;
    mat3 cov = T * Sigma * transpose3(T);

    // low-pass filter: every splat covers at least ~1 pixel
    float a = cov[0][0] + 0.3;
    float b = cov[0][1];
    float c = cov[1][1] + 0.3;

    float det = a * c - b * b;
    if (det <= 0.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    vConic = vec3(c, -b, a) / det;

    // eigen decomposition of the 2D covariance
    float mid = 0.5 * (a + c);
    float radius = length(vec2(0.5 * (a - c), b));
    float lambda1 = mid + radius;
    float lambda2 = max(mid - radius, 0.1);
    vec2 v1 = abs(b) > 1e-6 ? normalize(vec2(b, lambda1 - a)) : (a >= c ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    vec2 v2 = vec2(-v1.y, v1.x);

    // 3 sigma extents along the ellipse axes
    vec2 majorAxis = min(3.0 * sqrt(lambda1), 1024.0) * v1;
    vec2 minorAxis = min(3.0 * sqrt(lambda2), 1024.0) * v2;

    // quad corners are +-0.5, map to +-1 so the quad spans the full 3 sigma
    vec2 corner = position.xy * 2.0;
    vOffset = corner.x * majorAxis + corner.y * minorAxis;

    vec4 clipCenter = projectionMatrix * viewCenter;
    vec2 ndc = clipCenter.xy / clipCenter.w + vOffset / (viewport * 0.5);
    gl_Position = vec4(ndc * clipCenter.w, clipCenter.z, clipCenter.w);
  }
`;

export const fragmentShaderWebGLInstanced = `
  precision highp float;

  varying vec3 vColor;
  varying float vOpacity;
  varying vec2 vOffset;
  varying vec3 vConic;

  void main() {
    vec2 d = vOffset;

    // power = -0.5 * d^T * Sigma^-1 * d
    float power = -0.5 * (vConic.x * d.x * d.x + vConic.z * d.y * d.y) - vConic.y * d.x * d.y;
    if (power > 0.0) discard;

    float alpha = min(0.99, vOpacity * exp(power));
    if (alpha < 1.0 / 255.0) discard;

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
    @location(2) pixelOffset: vec2f, // pixel offset from splat center
    @location(3) conic: vec3f,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  // quaternion (x, y, z, w) to rotation matrix
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

    let viewCenter = uniforms.viewMatrix * vec4f(instancePosition, 1.0);

    // cull splats behind the camera
    if (viewCenter.z > -0.01) {
      output.position = vec4f(0.0, 0.0, 2.0, 1.0);
      return output;
    }

    // 3D covariance
    let M = quatToMat3(normalize(instanceRotation)) * mat3x3f(
      instanceScale.x, 0.0, 0.0,
      0.0, instanceScale.y, 0.0,
      0.0, 0.0, instanceScale.z
    );
    let Sigma = M * transpose(M);

    // Jacobian of the perspective projection (pixels, y up). Camera looks down -z,
    // so use tz = -z. Clamp x/y to slightly beyond the frustum to keep J stable.
    let proj = uniforms.projectionMatrix;
    let tz = -viewCenter.z;
    let focal = vec2f(proj[0][0], proj[1][1]) * uniforms.viewport * 0.5;
    let lim = 1.3 / vec2f(proj[0][0], proj[1][1]);
    let txy = clamp(viewCenter.xy / tz, -lim, lim) * tz;

    let J = mat3x3f(
      focal.x / tz, 0.0, 0.0,
      0.0, focal.y / tz, 0.0,
      focal.x * txy.x / (tz * tz), focal.y * txy.y / (tz * tz), 0.0
    );
    let view = uniforms.viewMatrix;
    let W = mat3x3f(view[0].xyz, view[1].xyz, view[2].xyz);
    let T = J * W;
    let cov = T * Sigma * transpose(T);

    // low-pass filter: every splat covers at least ~1 pixel
    let a = cov[0][0] + 0.3;
    let b = cov[0][1];
    let c = cov[1][1] + 0.3;

    let det = a * c - b * b;
    if (det <= 0.0) {
      output.position = vec4f(0.0, 0.0, 2.0, 1.0);
      return output;
    }
    output.conic = vec3f(c, -b, a) / det;

    // eigen decomposition of the 2D covariance
    let mid = 0.5 * (a + c);
    let radius = length(vec2f(0.5 * (a - c), b));
    let lambda1 = mid + radius;
    let lambda2 = max(mid - radius, 0.1);
    var v1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), a >= c);
    if (abs(b) > 1e-6) {
      v1 = normalize(vec2f(b, lambda1 - a));
    }
    let v2 = vec2f(-v1.y, v1.x);

    // 3 sigma extents along the ellipse axes
    let majorAxis = min(3.0 * sqrt(lambda1), 1024.0) * v1;
    let minorAxis = min(3.0 * sqrt(lambda2), 1024.0) * v2;

    // quad corners are +-0.5, map to +-1 so the quad spans the full 3 sigma
    let corner = position.xy * 2.0;
    output.pixelOffset = corner.x * majorAxis + corner.y * minorAxis;

    let clipCenter = proj * viewCenter;
    let ndc = clipCenter.xy / clipCenter.w + output.pixelOffset / (uniforms.viewport * 0.5);

    // projection matrix is GL-style (z in [-w, w]); remap to WebGPU's [0, w]
    output.position = vec4f(ndc * clipCenter.w, 0.5 * (clipCenter.z + clipCenter.w), clipCenter.w);

    return output;
  }
`;

export const fragmentShaderWebGPUInstanced = `
  @fragment
  fn fragmentMain(
    @location(0) color: vec3f,
    @location(1) opacity: f32,
    @location(2) pixelOffset: vec2f,
    @location(3) conic: vec3f
  ) -> @location(0) vec4f {
    let d = pixelOffset;

    // power = -0.5 * d^T * Sigma^-1 * d
    let power = -0.5 * (conic.x * d.x * d.x + conic.z * d.y * d.y) - conic.y * d.x * d.y;
    if (power > 0.0) {
      discard;
    }

    let alpha = min(0.99, opacity * exp(power));
    if (alpha < 1.0 / 255.0) {
      discard;
    }

    return vec4f(color, alpha);
  }
`;
