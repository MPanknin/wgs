import { config } from './Config';
import { WebGLRenderer } from './renderers/WebGLRenderer';
import { WebGPURenderer } from './renderers/WebGPURenderer';
import { Scene } from './core/Scene';
import { Camera } from './core/Camera';
import { CameraControl } from './core/CameraControl';
import type { Renderer } from './core/Renderer';
import {
  Shader,
  vertexShaderWebGPU,
  vertexShaderWebGL,
  fragmentShaderWebGPU,
  fragmentShaderWebGL,
} from './core/Shader';
import { Material } from './core/Material';
import { Mesh } from './core/Mesh';
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

  const shader = new Shader({
    vertex: config.backend === 'webgpu' ? vertexShaderWebGPU : vertexShaderWebGL,
    fragment: config.backend === 'webgpu' ? fragmentShaderWebGPU : fragmentShaderWebGL,
  });

  const matBlue = new Material({
    shader,
    color: [0.2, 0.6, 1.0],
    opacity: 0.5,
  });

  const matGreen = new Material({
    shader,
    color: [0.2, 0.6, 0.5],
    opacity: 0.5,
  });

  const mesh1 = new Mesh({
    vertices: testTriangle,
    material: matBlue,
  });
  mesh1.position = [-0.6, 0, 0];
  mesh1.markMatrixDirty();

  const mesh2 = new Mesh({
    vertices: testTriangle,
    material: matGreen,
  });
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

