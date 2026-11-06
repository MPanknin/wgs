# wgs

A minimal Gaussian splatting renderer for WebGL and WebGPU.

<img width="1561" height="829" alt="image" src="https://github.com/user-attachments/assets/4f6dc972-c54e-4382-9b9d-586fe05fca0d" />

## Pipeline

1. **Load** – `src/loaders/PLYLoader.ts` decodes SuperSplat's compressed `.ply`,
   `src/loaders/SOGLoader.ts` decodes PlayCanvas
   [SOG](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/)
   (bundled `.sog` or an unbundled `meta.json`). Both produce position,
   rotation, scale, color and opacity per splat.
2. **Pack** – `src/core/SplatMesh.ts` precomputes the 3D covariance
   `Σ = R S Sᵀ Rᵀ` and packs each splat into 32 bytes (position, rgba8 color,
   `Σ` as 6 halfs).
3. **Sort** – `SplatMesh` sorts splat indices back to front on the CPU
   (counting sort on camera distance) whenever the camera moves.
4. **Project** – vertex pulling, no vertex buffers: each instance reads its
   splat index from the sorted order and fetches the packed splat (RGBA32UI
   texture on WebGL2, storage buffer on WebGPU). The vertex shader in
   `src/core/SplatShaders.ts` projects `Σ` to screen space
   (`Σ' = J W Σ Wᵀ Jᵀ`) and stretches a 4-vertex strip over the resulting
   ellipse (3σ).
5. **Shade** – the fragment shader evaluates the 2D Gaussian per pixel and
   blends it over what is already drawn.

The same pipeline is implemented twice: `src/renderers/WebGLRenderer.ts` and
`src/renderers/WebGPURenderer.ts`.

## Run

```sh
bun install
bun run dev
```

Opens at http://localhost:3000. Uses WebGPU when available, otherwise WebGL2.
Force a backend with `?webgl` or `?webgpu`. Load another model with
`?model=/models/banana.sog`.

Left drag to orbit, right drag to pan, scroll to zoom.

## References

- Kerbl et al., [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) (2023)
- Zwicker et al., EWA Splatting (2002)
