// Gaussian splat projection (EWA splatting, Zwicker et al. / Kerbl et al. 3DGS):
// the 3D covariance Σ (precomputed per splat, see SplatMesh) is projected to
// screen space as cov2d = J W Σ Wᵀ Jᵀ, where W is the view rotation and J the
// Jacobian of the perspective projection at the splat center. The quad is
// stretched along the eigenvectors of cov2d to 3 sigma, and the fragment shader
// evaluates the gaussian with the inverse covariance (conic) in pixel space.
//
// Vertex pulling: no vertex buffers. Each instance is one splat, drawn as a
// 4-vertex triangle strip. The instance reads its splat index from the sorted
// order, fetches the packed splat and derives the quad corner from the vertex index.

export const splatVertexGLSL = `#version 300 es
  precision highp float;
  precision highp int;
  precision highp usampler2D;

  uniform usampler2D splats; // RGBA32UI, 2 texels per splat
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec2 viewport;
  uniform float invCovScale;

  in uint splatIndex; // per instance, from the sorted order

  flat out vec4 vColor;
  out vec2 vOffset; // pixel offset from splat center
  flat out vec3 vConic;

  const vec4 CULLED = vec4(0.0, 0.0, 2.0, 1.0);

  void main() {
    // the texture width is even, so both texels of a splat share a row
    int width = textureSize(splats, 0).x;
    int t = int(splatIndex) * 2;
    ivec2 uv = ivec2(t % width, t / width);
    uvec4 a = texelFetch(splats, uv, 0);
    uvec4 b = texelFetch(splats, uv + ivec2(1, 0), 0);

    vec3 center = uintBitsToFloat(a.xyz);
    vColor = vec4((uvec4(a.w, a.w >> 8, a.w >> 16, a.w >> 24) & 0xffu)) / 255.0;

    vec4 viewCenter = viewMatrix * vec4(center, 1.0);

    // cull splats behind the camera
    if (viewCenter.z > -0.01) {
      gl_Position = CULLED;
      return;
    }

    vec2 c0 = unpackHalf2x16(b.x);
    vec2 c1 = unpackHalf2x16(b.y);
    vec2 c2 = unpackHalf2x16(b.z);
    mat3 Sigma = mat3(
      c0.x, c0.y, c1.x,
      c0.y, c1.y, c2.x,
      c1.x, c2.x, c2.y
    ) * invCovScale;

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
    mat3 W = mat3(viewMatrix);
    mat3 T = J * W;
    mat3 cov = T * Sigma * transpose(T);

    // low-pass filter: every splat covers at least ~1 pixel
    float ca = cov[0][0] + 0.3;
    float cb = cov[0][1];
    float cc = cov[1][1] + 0.3;

    float det = ca * cc - cb * cb;
    if (det <= 0.0) {
      gl_Position = CULLED;
      return;
    }
    vConic = vec3(cc, -cb, ca) / det;

    // eigen decomposition of the 2D covariance
    float mid = 0.5 * (ca + cc);
    float radius = length(vec2(0.5 * (ca - cc), cb));
    float lambda1 = mid + radius;
    float lambda2 = max(mid - radius, 0.1);
    vec2 v1 = abs(cb) > 1e-6 ? normalize(vec2(cb, lambda1 - ca)) : (ca >= cc ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
    vec2 v2 = vec2(-v1.y, v1.x);

    // 3 sigma extents along the ellipse axes
    vec2 majorAxis = min(3.0 * sqrt(lambda1), 1024.0) * v1;
    vec2 minorAxis = min(3.0 * sqrt(lambda2), 1024.0) * v2;

    // strip corners (-1,-1), (1,-1), (-1,1), (1,1)
    vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
    vOffset = corner.x * majorAxis + corner.y * minorAxis;

    vec4 clipCenter = projectionMatrix * viewCenter;
    vec2 ndc = clipCenter.xy / clipCenter.w + vOffset / (viewport * 0.5);
    gl_Position = vec4(ndc * clipCenter.w, clipCenter.z, clipCenter.w);
  }
`;

export const splatFragmentGLSL = `#version 300 es
  precision highp float;

  flat in vec4 vColor;
  in vec2 vOffset;
  flat in vec3 vConic;

  out vec4 fragColor;

  void main() {
    vec2 d = vOffset;

    // power = -0.5 * d^T * Sigma^-1 * d
    float power = -0.5 * (vConic.x * d.x * d.x + vConic.z * d.y * d.y) - vConic.y * d.x * d.y;
    if (power > 0.0) discard;

    float alpha = min(0.99, vColor.a * exp(power));
    if (alpha < 1.0 / 255.0) discard;

    fragColor = vec4(vColor.rgb, alpha);
  }
`;

export const splatWGSL = `
  struct Uniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    viewport: vec2f,
    invCovScale: f32,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) color: vec4f,
    @location(1) pixelOffset: vec2f, // pixel offset from splat center
    @location(2) @interpolate(flat) conic: vec3f,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var<storage, read> splats: array<vec4u>; // 2 per splat
  @group(0) @binding(2) var<storage, read> order: array<u32>;

  const CULLED = vec4f(0.0, 0.0, 2.0, 1.0);

  @vertex
  fn vertexMain(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
  ) -> VertexOutput {
    var output: VertexOutput;

    let index = order[instanceIndex];
    let a = splats[index * 2u];
    let b = splats[index * 2u + 1u];

    let center = bitcast<vec3f>(a.xyz);
    output.color = unpack4x8unorm(a.w);

    let viewCenter = uniforms.viewMatrix * vec4f(center, 1.0);

    // cull splats behind the camera
    if (viewCenter.z > -0.01) {
      output.position = CULLED;
      return output;
    }

    let c0 = unpack2x16float(b.x);
    let c1 = unpack2x16float(b.y);
    let c2 = unpack2x16float(b.z);
    let Sigma = mat3x3f(
      c0.x, c0.y, c1.x,
      c0.y, c1.y, c2.x,
      c1.x, c2.x, c2.y
    ) * uniforms.invCovScale;

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
    let ca = cov[0][0] + 0.3;
    let cb = cov[0][1];
    let cc = cov[1][1] + 0.3;

    let det = ca * cc - cb * cb;
    if (det <= 0.0) {
      output.position = CULLED;
      return output;
    }
    output.conic = vec3f(cc, -cb, ca) / det;

    // eigen decomposition of the 2D covariance
    let mid = 0.5 * (ca + cc);
    let radius = length(vec2f(0.5 * (ca - cc), cb));
    let lambda1 = mid + radius;
    let lambda2 = max(mid - radius, 0.1);
    var v1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), ca >= cc);
    if (abs(cb) > 1e-6) {
      v1 = normalize(vec2f(cb, lambda1 - ca));
    }
    let v2 = vec2f(-v1.y, v1.x);

    // 3 sigma extents along the ellipse axes
    let majorAxis = min(3.0 * sqrt(lambda1), 1024.0) * v1;
    let minorAxis = min(3.0 * sqrt(lambda2), 1024.0) * v2;

    // strip corners (-1,-1), (1,-1), (-1,1), (1,1)
    let corner = vec2f(f32(vertexIndex & 1u), f32(vertexIndex >> 1u)) * 2.0 - 1.0;
    output.pixelOffset = corner.x * majorAxis + corner.y * minorAxis;

    let clipCenter = proj * viewCenter;
    let ndc = clipCenter.xy / clipCenter.w + output.pixelOffset / (uniforms.viewport * 0.5);

    // projection matrix is GL-style (z in [-w, w]); remap to WebGPU's [0, w]
    output.position = vec4f(ndc * clipCenter.w, 0.5 * (clipCenter.z + clipCenter.w), clipCenter.w);

    return output;
  }

  @fragment
  fn fragmentMain(
    @location(0) @interpolate(flat) color: vec4f,
    @location(1) pixelOffset: vec2f,
    @location(2) @interpolate(flat) conic: vec3f
  ) -> @location(0) vec4f {
    let d = pixelOffset;

    // power = -0.5 * d^T * Sigma^-1 * d
    let power = -0.5 * (conic.x * d.x * d.x + conic.z * d.y * d.y) - conic.y * d.x * d.y;
    if (power > 0.0) {
      discard;
    }

    let alpha = min(0.99, color.a * exp(power));
    if (alpha < 1.0 / 255.0) {
      discard;
    }

    return vec4f(color.rgb, alpha);
  }
`;
