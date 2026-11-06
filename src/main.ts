import { config } from './config';
import { WebGLRenderer } from './renderers/WebGLRenderer';
import { WebGPURenderer } from './renderers/WebGPURenderer';
import { Scene } from './core/Scene';
import { Camera } from './core/Camera';
import { CameraControl } from './core/CameraControl';
import type { Renderer } from './core/Renderer';
import type { SplatData } from './core/SplatData';
import { SplatMesh } from './core/SplatMesh';
import { PLYLoader } from './loaders/PLYLoader';
import { SOGLoader } from './loaders/SOGLoader';

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

function loadSplats(url: string): Promise<SplatData> {
  if (url.endsWith('.sog') || url.endsWith('.json')) {
    return new SOGLoader().load(url);
  }
  return new PLYLoader().load(url);
}

async function main() {
  const renderer = await createRenderer(canvas);
  const scene = new Scene();
  const camera = new Camera(canvas.width / canvas.height);

  setupCanvas(canvas, camera, renderer);
  new CameraControl(camera, canvas, 5);

  try {
    scene.add(new SplatMesh(await loadSplats(config.model)));
  } catch (error) {
    console.error(`Failed to load ${config.model}:`, error);
  }

  function animate() {
    renderer.clear(0.5, 0.5, 0.5, 1);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

main().catch(console.error);
