import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import { Shader } from '../core/Shader';
import { Mesh } from '../core/Mesh';
import { InstancedMesh } from '../core/InstancedMesh';

interface GPUShaderResources {
  pipeline: GPURenderPipeline;
}

interface GPUMeshResources {
  vertexBuffer: GPUBuffer;
  indexBuffer?: GPUBuffer;
  vertexCount: number;
  indexCount?: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

interface GPUInstancedMeshResources {
  vertexBuffer: GPUBuffer;
  indexBuffer?: GPUBuffer;
  vertexCount: number;
  indexCount?: number;
  instanceBuffer: GPUBuffer;
  instanceCount: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

export class WebGPURenderer implements Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private depthTexture!: GPUTexture;
  private shaderResources = new WeakMap<Shader, GPUShaderResources>();
  private meshResources = new WeakMap<Mesh, GPUMeshResources>();
  private instancedMeshResources = new WeakMap<InstancedMesh, GPUInstancedMeshResources>();

  constructor(private canvas: HTMLCanvasElement) {}

  async init(): Promise<void> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not supported');
    }

    const gpu = (navigator as any).gpu as GPU;
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await adapter.requestDevice();

    const context = this.canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to get WebGPU context');
    }
    this.context = context as GPUCanvasContext;

    this.format = gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
    });

    // create depth texture
    this.depthTexture = this.device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
      },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private getOrCreateShaderResources(shader: Shader): GPUShaderResources {
    let resources = this.shaderResources.get(shader);
    if (resources) return resources;

    const shaderModule = this.device.createShaderModule({
      code: shader.vertex + '\n' + shader.fragment,
    });

    // todo: this is ugly 
    const isInstanced = shader.vertex.includes('instancePosition');

    const vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: 12, // 3 floats * 4 bytes (vertex position)
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
          },
        ],
      },
    ];

    if (isInstanced) {
      // Add instance buffer layout
      vertexBuffers.push({
        arrayStride: 56, // 14 floats * 4 bytes (pos:3, rot:4, scale:3, color:3, opacity:1)
        stepMode: 'instance',
        attributes: [
          {
            shaderLocation: 1, // instancePosition
            offset: 0,
            format: 'float32x3',
          },
          {
            shaderLocation: 2, // instanceRotation
            offset: 12,
            format: 'float32x4',
          },
          {
            shaderLocation: 3, // instanceScale
            offset: 28,
            format: 'float32x3',
          },
          {
            shaderLocation: 4, // instanceColor
            offset: 40,
            format: 'float32x3',
          },
          {
            shaderLocation: 5, // instanceOpacity
            offset: 52,
            format: 'float32',
          },
        ],
      });
    }

    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: vertexBuffers,
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: this.format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    resources = { pipeline };
    this.shaderResources.set(shader, resources);
    return resources;
  }

  private getOrCreateMeshResources(mesh: Mesh, shader: Shader): GPUMeshResources {
    let resources = this.meshResources.get(mesh);
    if (resources) return resources;

    const vertexBuffer = this.device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
    vertexBuffer.unmap();

    let indexBuffer: GPUBuffer | undefined;
    let indexCount: number | undefined;

    if (mesh.indices) {
      indexBuffer = this.device.createBuffer({
        size: mesh.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Uint16Array(indexBuffer.getMappedRange()).set(mesh.indices);
      indexBuffer.unmap();
      indexCount = mesh.indices.length;
    }

    const vertexCount = mesh.vertices.length / 3;

    const uniformBuffer = this.device.createBuffer({
      size: 208, // 3 mat4x4 matrices (192) + vec3 color (12) + f32 opacity (4)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderResources = this.getOrCreateShaderResources(shader);
    const bindGroupLayout = shaderResources.pipeline.getBindGroupLayout(0);
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
          },
        },
      ],
    });

    resources = {
      vertexBuffer,
      indexBuffer,
      vertexCount,
      indexCount,
      uniformBuffer,
      bindGroup,
    };

    this.meshResources.set(mesh, resources);
    return resources;
  }

  private getOrCreateInstancedMeshResources(mesh: InstancedMesh, shader: Shader): GPUInstancedMeshResources {
    let resources = this.instancedMeshResources.get(mesh);
    if (resources) return resources;

    const vertexBuffer = this.device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
    vertexBuffer.unmap();

    let indexBuffer: GPUBuffer | undefined;
    let indexCount: number | undefined;

    if (mesh.indices) {
      indexBuffer = this.device.createBuffer({
        size: mesh.indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Uint16Array(indexBuffer.getMappedRange()).set(mesh.indices);
      indexBuffer.unmap();
      indexCount = mesh.indices.length;
    }

    const vertexCount = mesh.vertices.length / 3;

    const instanceBuffer = this.device.createBuffer({
      size: mesh.instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(instanceBuffer.getMappedRange()).set(mesh.instanceData);
    instanceBuffer.unmap();

    const uniformBuffer = this.device.createBuffer({
      size: 128, // 2 mat4x4 matrices (view + projection = 128 bytes)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderResources = this.getOrCreateShaderResources(shader);
    const bindGroupLayout = shaderResources.pipeline.getBindGroupLayout(0);
    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
          },
        },
      ],
    });

    resources = {
      vertexBuffer,
      indexBuffer,
      vertexCount,
      indexCount,
      instanceBuffer,
      instanceCount: mesh.instanceCount,
      uniformBuffer,
      bindGroup,
    };

    this.instancedMeshResources.set(mesh, resources);
    return resources;
  }

  render(scene: Scene, camera: Camera): void {
    scene.updateMatrixWorld();

    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    for (const obj of scene.getMeshes()) {
      if (!obj.material?.shader) {
        continue;
      }

      if (obj instanceof InstancedMesh) {
        const shader = this.getOrCreateShaderResources(obj.material.shader);
        const meshResources = this.getOrCreateInstancedMeshResources(obj, obj.material.shader);

        // update instance buffer with latest data
        this.device.queue.writeBuffer(meshResources.instanceBuffer, 0, obj.instanceData.buffer, obj.instanceData.byteOffset, obj.instanceData.byteLength);

        // uniform data: only view and projection matrices (32 floats)
        const uniformData = new Float32Array(32);
        uniformData.set(camera.viewMatrix, 0);
        uniformData.set(camera.projectionMatrix, 16);

        this.device.queue.writeBuffer(meshResources.uniformBuffer, 0, uniformData);

        renderPass.setPipeline(shader.pipeline);
        renderPass.setBindGroup(0, meshResources.bindGroup);
        renderPass.setVertexBuffer(0, meshResources.vertexBuffer);
        renderPass.setVertexBuffer(1, meshResources.instanceBuffer);

        if (meshResources.indexBuffer && meshResources.indexCount) {
          renderPass.setIndexBuffer(meshResources.indexBuffer, 'uint16');
          renderPass.drawIndexed(meshResources.indexCount, meshResources.instanceCount);
        } else {
          renderPass.draw(meshResources.vertexCount, meshResources.instanceCount);
        }

      } else if (obj instanceof Mesh) {
        const shader = this.getOrCreateShaderResources(obj.material.shader);
        const meshResources = this.getOrCreateMeshResources(obj, obj.material.shader);

        const uniformData = new Float32Array(52); // 3 x mat4 + vec3 + f32 = 52 floats
        uniformData.set(obj.worldMatrix, 0);
        uniformData.set(camera.viewMatrix, 16);
        uniformData.set(camera.projectionMatrix, 32);

        // set color (offset 48)
        uniformData[48] = obj.material.color[0];
        uniformData[49] = obj.material.color[1];
        uniformData[50] = obj.material.color[2];

        // set opacity (offset 51, right after vec3)
        uniformData[51] = obj.material.opacity;

        this.device.queue.writeBuffer(meshResources.uniformBuffer, 0, uniformData);

        renderPass.setPipeline(shader.pipeline);
        renderPass.setBindGroup(0, meshResources.bindGroup);
        renderPass.setVertexBuffer(0, meshResources.vertexBuffer);

        if (meshResources.indexBuffer && meshResources.indexCount) {
          renderPass.setIndexBuffer(meshResources.indexBuffer, 'uint16');
          renderPass.drawIndexed(meshResources.indexCount);
        } else {
          renderPass.draw(meshResources.vertexCount);
        }
      }
    }

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  clear(_r: number, _g: number, _b: number, _a: number): void {
    // WebGPU clears are handled in the render pass
    // We could store these values and use them in the next render call
  }

  resize(width: number, height: number): void {
    // Recreate depth texture with new size
    this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({
      size: { width, height },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  destroy(): void {
    this.device.destroy();
  }
}
