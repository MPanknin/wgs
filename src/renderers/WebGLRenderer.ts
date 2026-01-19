import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import type { Buffer, BufferDescriptor } from '../core/Buffer';
import type { Shader, ShaderDescriptor } from '../core/Shader';
import type { Mesh, MeshDescriptor } from '../core/Mesh';

class GLBuffer implements Buffer {
  constructor(public glBuffer: WebGLBuffer) {}

  destroy(): void {
    // TODO: implement cleanup
  }
}

class GLShader implements Shader {
  constructor(
    public program: WebGLProgram,
    public positionLocation: number,
    public viewMatrixLocation: WebGLUniformLocation | null,
    public projectionMatrixLocation: WebGLUniformLocation | null
  ) {}

  destroy(): void {
    // TODO: implement cleanup
  }
}

class GLMesh implements Mesh {
  material?: import('../core/Material').Material;

  constructor(
    public vertexBuffer: GLBuffer,
    public indexBuffer: GLBuffer | undefined,
    public vertexCount: number,
    public indexCount: number | undefined
  ) {}

  destroy(): void {
    // TODO: implement cleanup
  }
}

export class WebGLRenderer implements Renderer {
  private gl: WebGLRenderingContext;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl;

    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  createBuffer(descriptor: BufferDescriptor): Buffer {
    const { gl } = this;
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error('Failed to create buffer');
    }

    const target = descriptor.usage === 'vertex' ? gl.ARRAY_BUFFER : gl.ELEMENT_ARRAY_BUFFER;
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, descriptor.data, gl.STATIC_DRAW);

    return new GLBuffer(buffer);
  }

  createShader(descriptor: ShaderDescriptor): Shader {
    const { gl } = this;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) throw new Error('Failed to create vertex shader');
    gl.shaderSource(vertexShader, descriptor.vertex);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw new Error('Vertex shader compile error: ' + gl.getShaderInfoLog(vertexShader));
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) throw new Error('Failed to create fragment shader');
    gl.shaderSource(fragmentShader, descriptor.fragment);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw new Error('Fragment shader compile error: ' + gl.getShaderInfoLog(fragmentShader));
    }

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
    }

    const positionLocation = gl.getAttribLocation(program, 'position');
    const viewMatrixLocation = gl.getUniformLocation(program, 'viewMatrix');
    const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');

    return new GLShader(program, positionLocation, viewMatrixLocation, projectionMatrixLocation);
  }

  createMesh(descriptor: MeshDescriptor): Mesh {
    const vertexBuffer = this.createBuffer({
      data: descriptor.vertices,
      usage: 'vertex',
    }) as GLBuffer;

    let indexBuffer: GLBuffer | undefined;
    let indexCount: number | undefined;

    if (descriptor.indices) {
      indexBuffer = this.createBuffer({
        data: descriptor.indices,
        usage: 'index',
      }) as GLBuffer;
      indexCount = descriptor.indices.length;
    }

    const vertexCount = descriptor.vertices.length / 3;

    return new GLMesh(vertexBuffer, indexBuffer, vertexCount, indexCount);
  }

  render(scene: Scene, camera: Camera): void {
    const { gl } = this;

    for (const mesh of scene.meshes) {
      if (!mesh.material?.shader) {
        continue;
      }

      const glMesh = mesh as GLMesh;
      const shader = mesh.material.shader as GLShader;

      gl.useProgram(shader.program);

      // camera uniforms
      if (shader.viewMatrixLocation) {
        gl.uniformMatrix4fv(shader.viewMatrixLocation, false, camera.viewMatrix);
      }
      if (shader.projectionMatrixLocation) {
        gl.uniformMatrix4fv(shader.projectionMatrixLocation, false, camera.projectionMatrix);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, glMesh.vertexBuffer.glBuffer);
      gl.enableVertexAttribArray(shader.positionLocation);
      gl.vertexAttribPointer(shader.positionLocation, 3, gl.FLOAT, false, 0, 0);

      if (glMesh.indexBuffer && glMesh.indexCount) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glMesh.indexBuffer.glBuffer);
        gl.drawElements(gl.TRIANGLES, glMesh.indexCount, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, glMesh.vertexCount);
      }
    }
  }

  clear(r: number, g: number, b: number, a: number): void {
    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  destroy(): void {
    // TODO: implement cleanup
  }
}
