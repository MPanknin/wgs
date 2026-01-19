import { config } from './config';
import { WebGLRenderer } from './renderers/WebGLRenderer';
import { WebGPURenderer } from './renderers/WebGPURenderer';
import { Scene } from './core/Scene';
import { Camera } from './core/Camera';
import type { Renderer } from './core/Renderer';
import { vertexShaderWebGPU, vertexShaderWebGL, fragmentShaderWebGPU, fragmentShaderWebGL } from './core/Shader';

console.log('WGS - Initializing...');

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

if (!canvas) {
  throw new Error('Canvas element not found');
}

// Resize canvas to match display size
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

console.log('Canvas initialized:', canvas.width, 'x', canvas.height);
console.log('Using backend:', config.backend);

const triangleVertices = new Float32Array([
  0.0, 0.5, 0.0,
  -0.5, -0.5, 0.0,
  0.5, -0.5, 0.0,
]);

async function main() {
  let renderer: Renderer;

  if (config.backend === 'webgpu') {
    const webgpuRenderer = new WebGPURenderer(canvas);
    await webgpuRenderer.init();
    renderer = webgpuRenderer;
  } else {
    renderer = new WebGLRenderer(canvas);
  }

  const scene = new Scene();
  const camera = new Camera();

  const shader = renderer.createShader({
    vertex: config.backend === 'webgpu' ? vertexShaderWebGPU : vertexShaderWebGL,
    fragment: config.backend === 'webgpu' ? fragmentShaderWebGPU : fragmentShaderWebGL,
  });

  const mesh = renderer.createMesh({
    vertices: triangleVertices,
  });

  mesh.material = { shader };

  scene.add(mesh);

  renderer.clear(0, 0, 0, 1);
  renderer.render(scene, camera);

  console.log('Triangle rendered!');
}

main().catch(console.error);

