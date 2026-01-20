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
import { InstancedMesh } from './core/InstancedMesh';
import { testCube, testCubeIndices, testQuad, testQuadIndices } from './Data';
import { PLYLoader } from './loaders/PLYLoader';
import {
  vertexShaderWebGLInstanced,
  fragmentShaderWebGLInstanced,
  vertexShaderWebGPUInstanced,
  fragmentShaderWebGPUInstanced,
} from './core/Shader';

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
  new CameraControl(camera, canvas, 5);



  const shader = new Shader({
    vertex: config.backend === 'webgpu' ? vertexShaderWebGPU : vertexShaderWebGL,
    fragment: config.backend === 'webgpu' ? fragmentShaderWebGPU : fragmentShaderWebGL,
  });  

  const matBlue = new Material({
    shader,
    color: [0.2, 0.6, 1.0],
    opacity: 0.5,
  });

  const loader = new PLYLoader();
  try {
    const splats = await loader.load('/models/banana.compressed.ply');

    const scaleFactor = 0.01;
    const maxSplats = Math.min(splats.length, 250000); 

    const instancedShader = new Shader({
      vertex: config.backend === 'webgpu' ? vertexShaderWebGPUInstanced : vertexShaderWebGLInstanced,
      fragment: config.backend === 'webgpu' ? fragmentShaderWebGPUInstanced : fragmentShaderWebGLInstanced,
    });

    const instancedMaterial = new Material({
      shader: instancedShader,
      color: [1, 1, 1],
      opacity: 1.0,
    });

    const instancedMesh = new InstancedMesh({
      vertices: testQuad,
      indices: testQuadIndices,
      material: instancedMaterial,
      instanceCount: maxSplats,
    });

    for (let i = 0; i < maxSplats; i++) {
      const splat = splats[i];
      if (!splat) continue;

      instancedMesh.setInstanceData(i, {
        position: splat.position,
        rotation: splat.rotation,
        scale: [
          splat.scale[0] * scaleFactor,
          splat.scale[1] * scaleFactor,
          splat.scale[2] * scaleFactor,
        ],
        color: splat.color,
        opacity: splat.opacity,
      });
    }

    scene.add(instancedMesh);
    console.log(`Created instanced mesh with ${maxSplats} instances`);

  } catch (error) {
    console.error('Failed to load PLY file:', error);
  }

  const mesh1 = new Mesh({
    vertices: testCube,
    indices: testCubeIndices,
    material: matBlue,
  });
  mesh1.position = [0, 0, -5];
  mesh1.markMatrixDirty();

  // scene.add(mesh1);

  function animate() {
    renderer.clear(0, 0, 0, 1);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

main().catch(console.error);

