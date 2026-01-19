import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import type { Buffer, BufferDescriptor } from '../core/Buffer';
import type { Shader, ShaderDescriptor } from '../core/Shader';
import type { Mesh, MeshDescriptor } from '../core/Mesh';

class GPUBufferWrapper implements Buffer {
  constructor(public gpuBuffer: GPUBuffer) {}

  destroy(): void {
    this.gpuBuffer.destroy();
  }
}

class GPUShaderWrapper implements Shader {
  constructor(
    public pipeline: GPURenderPipeline,
    public bindGroupLayout: GPUBindGroupLayout | null
  ) {}

  destroy(): void {
    // Pipelines don't need explicit cleanup
  }
}

class GPUMeshWrapper implements Mesh {
  material?: import('../core/Material').Material;

  constructor(
    public vertexBuffer: GPUBufferWrapper,
    public indexBuffer: GPUBufferWrapper | undefined,
    public vertexCount: number,
    public indexCount: number | undefined
  ) {}

  destroy(): void {
    this.vertexBuffer.destroy();
    this.indexBuffer?.destroy();
  }
}

export class WebGPURenderer implements Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

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
  }

  createBuffer(descriptor: BufferDescriptor): Buffer {
    const usage =
      descriptor.usage === 'vertex'
        ? GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        : GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST;

    const buffer = this.device.createBuffer({
      size: descriptor.data.byteLength,
      usage,
      mappedAtCreation: true,
    });

    const arrayBuffer = buffer.getMappedRange();
    if (descriptor.data instanceof Float32Array) {
      new Float32Array(arrayBuffer).set(descriptor.data);
    } else {
      new Uint16Array(arrayBuffer).set(descriptor.data);
    }
    buffer.unmap();

    return new GPUBufferWrapper(buffer);
  }

  createShader(descriptor: ShaderDescriptor): Shader {
    const shaderModule = this.device.createShaderModule({
      code: descriptor.vertex + '\n' + descriptor.fragment,
    });

    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: 12, // 3 floats * 4 bytes
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: this.format,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    return new GPUShaderWrapper(pipeline, null);
  }

  createMesh(descriptor: MeshDescriptor): Mesh {
    const vertexBuffer = this.createBuffer({
      data: descriptor.vertices,
      usage: 'vertex',
    }) as GPUBufferWrapper;

    let indexBuffer: GPUBufferWrapper | undefined;
    let indexCount: number | undefined;

    if (descriptor.indices) {
      indexBuffer = this.createBuffer({
        data: descriptor.indices,
        usage: 'index',
      }) as GPUBufferWrapper;
      indexCount = descriptor.indices.length;
    }

    const vertexCount = descriptor.vertices.length / 3;

    return new GPUMeshWrapper(vertexBuffer, indexBuffer, vertexCount, indexCount);
  }

  render(scene: Scene, _camera: Camera): void {
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
    });

    for (const mesh of scene.meshes) {
      if (!mesh.material?.shader) {
        continue;
      }

      const gpuMesh = mesh as GPUMeshWrapper;
      const shader = mesh.material.shader as GPUShaderWrapper;

      renderPass.setPipeline(shader.pipeline);
      renderPass.setVertexBuffer(0, gpuMesh.vertexBuffer.gpuBuffer);

      if (gpuMesh.indexBuffer && gpuMesh.indexCount) {
        renderPass.setIndexBuffer(gpuMesh.indexBuffer.gpuBuffer, 'uint16');
        renderPass.drawIndexed(gpuMesh.indexCount);
      } else {
        renderPass.draw(gpuMesh.vertexCount);
      }
    }

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  clear(_r: number, _g: number, _b: number, _a: number): void {
    // WebGPU clears are handled in the render pass
    // We could store these values and use them in the next render call
  }

  destroy(): void {
    this.device.destroy();
  }
}
