import { config } from './Config';
import { WebGLRenderer } from './renderers/WebGLRenderer';
import { WebGPURenderer } from './renderers/WebGPURenderer';
import { Scene } from './core/Scene';
import { Camera } from './core/Camera';
import { CameraControl } from './core/CameraControl';
import type { Renderer } from './core/Renderer';
import {
  vertexShaderWebGPU,
  vertexShaderWebGL,
  fragmentShaderWebGPU,
  fragmentShaderWebGL,
} from './core/Shader';
import { testTriangle } from './Data';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element not found');
}

function setupCanvas(canvas: HTMLCanvasElement, camera: Camera): void {
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.aspect = canvas.width / canvas.height;
    camera.updateMatrices();
  }

  resize();
  window.addEventListener('resize', resize);
}

async function createRenderer(canvas: HTMLCanvasElement): Promise<Renderer> {
  if (config.backend === 'webgpu') {
    const renderer = new WebGPURenderer(canvas);
    await renderer.init();
    return renderer;
  }
  return new WebGLRenderer(canvas);
}

async function main() {
  console.log('WGS - Initializing...');
  console.log('Backend:', config.backend);

  const renderer = await createRenderer(canvas);
  const scene = new Scene();
  const camera = new Camera(canvas.width / canvas.height);

  setupCanvas(canvas, camera);
  new CameraControl(camera, canvas);

  // Create test triangle
  const shader = renderer.createShader({
    vertex: config.backend === 'webgpu' ? vertexShaderWebGPU : vertexShaderWebGL,
    fragment: config.backend === 'webgpu' ? fragmentShaderWebGPU : fragmentShaderWebGL,
  });

  const mesh = renderer.createMesh({ vertices: testTriangle });
  mesh.material = { shader };
  scene.add(mesh);

  // Render loop
  function animate() {
    renderer.clear(0, 0, 0, 1);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
  console.log('Rendering started');
}

main().catch(console.error);

