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

function setupCanvas(canvas: HTMLCanvasElement, camera: Camera, renderer: Renderer): void {
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.aspect = canvas.width / canvas.height;
    camera.updateMatrices();
    renderer.resize(canvas.width, canvas.height);
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
  const renderer = await createRenderer(canvas);
  const scene = new Scene();
  const camera = new Camera(canvas.width / canvas.height);

  setupCanvas(canvas, camera, renderer);
  new CameraControl(camera, canvas);

  const shader1 = renderer.createShader({
    vertex: config.backend === 'webgpu' ? vertexShaderWebGPU : vertexShaderWebGL,
    fragment: config.backend === 'webgpu' ? fragmentShaderWebGPU : fragmentShaderWebGL,
  });

  const shader2 = renderer.createShader({
    vertex: config.backend === 'webgpu' ? vertexShaderWebGPU : vertexShaderWebGL,
    fragment: config.backend === 'webgpu' ? fragmentShaderWebGPU : fragmentShaderWebGL,
  });

  const mesh1 = renderer.createMesh({ vertices: testTriangle });
  mesh1.material = {
    shader: shader1,
    color: [0.2, 0.6, 1.0],
    opacity: 0.5,
  };
  mesh1.position = [-0.6, 0, 0];
  mesh1.markMatrixDirty();

  const mesh2 = renderer.createMesh({ vertices: testTriangle });
  mesh2.material = {
    shader: shader2,
    color: [0.2, 0.6, 0.5],
    opacity: 0.5,
  };
  mesh2.position = [0.2, 0, 0];
  mesh2.scale = [0.7, 0.7, 0.7];
  mesh2.markMatrixDirty();

  mesh1.addChild(mesh2);
  scene.add(mesh1);

  function animate() {
    renderer.clear(0, 0, 0, 1);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

main().catch(console.error);

