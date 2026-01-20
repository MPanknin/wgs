import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import type { Buffer, BufferDescriptor } from '../core/Buffer';
import type { Shader, ShaderDescriptor } from '../core/Shader';
import { Mesh, type MeshDescriptor } from '../core/Mesh';

class GPUBufferWrapper implements Buffer {
  constructor(public gpuBuffer: GPUBuffer) {}

  destroy(): void {
    this.gpuBuffer.destroy();
  }
}

class GPUShaderWrapper implements Shader {
  constructor(
    public pipeline: GPURenderPipeline
  ) {}

  destroy(): void {
    // Pipeline is managed by the device
  }
}

class GPUMeshWrapper extends Mesh {
  public uniformBuffer?: GPUBuffer;
  public bindGroup?: GPUBindGroup;

  constructor(
    public vertexBuffer: GPUBufferWrapper,
    public indexBuffer: GPUBufferWrapper | undefined,
    public vertexCount: number,
    public indexCount: number | undefined
  ) {
    super();
  }

  destroy(): void {
    this.vertexBuffer.destroy();
    this.indexBuffer?.destroy();
    this.uniformBuffer?.destroy();
  }
}

export class WebGPURenderer implements Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private depthTexture!: GPUTexture;

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

    return new GPUShaderWrapper(pipeline);
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

    for (const mesh of scene.getMeshes()) {
      if (!mesh.material?.shader) {
        continue;
      }

      const gpuMesh = mesh as GPUMeshWrapper;
      const shader = mesh.material.shader as GPUShaderWrapper;

      if (!gpuMesh.uniformBuffer || !gpuMesh.bindGroup) {
        gpuMesh.uniformBuffer = this.device.createBuffer({
          size: 208, // 3 mat4x4 matrices (192) + vec3 color (12) + f32 opacity (4)
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroupLayout = shader.pipeline.getBindGroupLayout(0);
        gpuMesh.bindGroup = this.device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: {
                buffer: gpuMesh.uniformBuffer,
              },
            },
          ],
        });
      }

      const uniformData = new Float32Array(52); // 3 x mat4 + vec3 + f32 = 52 floats
      uniformData.set(mesh.worldMatrix, 0);
      uniformData.set(camera.viewMatrix, 16);
      uniformData.set(camera.projectionMatrix, 32);

      // set color (offset 48)
      const color = mesh.material.color || [1, 0, 0];
      uniformData[48] = color[0];
      uniformData[49] = color[1];
      uniformData[50] = color[2];

      // set opacity (offset 51, right after vec3)
      const opacity = mesh.material.opacity ?? 1.0;
      uniformData[51] = opacity;

      this.device.queue.writeBuffer(gpuMesh.uniformBuffer, 0, uniformData);

      renderPass.setPipeline(shader.pipeline);
      renderPass.setBindGroup(0, gpuMesh.bindGroup);
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
