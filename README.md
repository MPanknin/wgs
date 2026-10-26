# wgs

A minimal Gaussian splatting renderer for WebGL and WebGPU.

> **Educational project.** This exists to understand the 3D Gaussian splatting
> pipeline end to end, not to be a production renderer. It deliberately skips
> optimizations (GPU sorting, spherical harmonics, culling, etc.).

<img width="1561" height="829" alt="image" src="https://github.com/user-attachments/assets/4f6dc972-c54e-4382-9b9d-586fe05fca0d" />

## Pipeline

1. **Load** – `src/loaders/PLYLoader.ts` decodes SuperSplat's compressed `.ply`
   (position, rotation, scale, color, opacity per splat).
2. **Sort** – `src/core/InstancedMesh.ts` sorts splats back to front on the CPU
   whenever the camera moves, since they are alpha blended.
3. **Project** – the vertex shader in `src/core/Shader.ts` builds the 3D
   covariance `Σ = R S Sᵀ Rᵀ`, projects it to screen space
   (`Σ' = J W Σ Wᵀ Jᵀ`) and stretches an instanced quad over the resulting
   ellipse (3σ).
4. **Shade** – the fragment shader evaluates the 2D Gaussian per pixel and
   blends it over what is already drawn.

The same pipeline is implemented twice: `src/renderers/WebGLRenderer.ts` and
`src/renderers/WebGPURenderer.ts`.

## Run

```sh
bun install
bun run dev
```

Opens at http://localhost:3000. Uses WebGPU when available, otherwise WebGL.
Force a backend with `?webgl` or `?webgpu`.

Left drag to orbit, right drag to pan, scroll to zoom.

## References

- Kerbl et al., [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) (2023)
- Zwicker et al., EWA Splatting (2002)
