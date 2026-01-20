import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import { Shader } from '../core/Shader';
import { Mesh } from '../core/Mesh';

interface GLShaderResources {
  program: WebGLProgram;
  positionLocation: number;
  modelMatrixLocation: WebGLUniformLocation | null;
  viewMatrixLocation: WebGLUniformLocation | null;
  projectionMatrixLocation: WebGLUniformLocation | null;
  colorLocation: WebGLUniformLocation | null;
  opacityLocation: WebGLUniformLocation | null;
}

interface GLMeshResources {
  vertexBuffer: WebGLBuffer;
  indexBuffer?: WebGLBuffer;
  vertexCount: number;
  indexCount?: number;
}

export class WebGLRenderer implements Renderer {
  private gl: WebGLRenderingContext;
  private shaderResources = new WeakMap<Shader, GLShaderResources>();
  private meshResources = new WeakMap<Mesh, GLMeshResources>();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl;

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private getOrCreateShaderResources(shader: Shader): GLShaderResources {
    let resources = this.shaderResources.get(shader);
    if (resources) return resources;

    const { gl } = this;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) throw new Error('Failed to create vertex shader');
    gl.shaderSource(vertexShader, shader.vertex);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw new Error('Vertex shader compile error: ' + gl.getShaderInfoLog(vertexShader));
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) throw new Error('Failed to create fragment shader');
    gl.shaderSource(fragmentShader, shader.fragment);
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
    const modelMatrixLocation = gl.getUniformLocation(program, 'modelMatrix');
    const viewMatrixLocation = gl.getUniformLocation(program, 'viewMatrix');
    const projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');
    const colorLocation = gl.getUniformLocation(program, 'color');
    const opacityLocation = gl.getUniformLocation(program, 'opacity');

    resources = {
      program,
      positionLocation,
      modelMatrixLocation,
      viewMatrixLocation,
      projectionMatrixLocation,
      colorLocation,
      opacityLocation,
    };

    this.shaderResources.set(shader, resources);
    return resources;
  }

  private getOrCreateMeshResources(mesh: Mesh): GLMeshResources {
    let resources = this.meshResources.get(mesh);
    if (resources) return resources;

    const { gl } = this;

    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) throw new Error('Failed to create vertex buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

    let indexBuffer: WebGLBuffer | undefined;
    let indexCount: number | undefined;

    if (mesh.indices) {
      indexBuffer = gl.createBuffer();
      if (!indexBuffer) throw new Error('Failed to create index buffer');
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      indexCount = mesh.indices.length;
    }

    const vertexCount = mesh.vertices.length / 3;

    resources = {
      vertexBuffer,
      indexBuffer,
      vertexCount,
      indexCount,
    };

    this.meshResources.set(mesh, resources);
    return resources;
  }

  render(scene: Scene, camera: Camera): void {
    const { gl } = this;

    scene.updateMatrixWorld();

    for (const mesh of scene.getMeshes()) {
      if (!mesh.material?.shader) {
        continue;
      }

      const shader = this.getOrCreateShaderResources(mesh.material.shader);
      const meshResources = this.getOrCreateMeshResources(mesh);

      gl.useProgram(shader.program);

      // model matrix
      if (shader.modelMatrixLocation) {
        gl.uniformMatrix4fv(shader.modelMatrixLocation, false, mesh.worldMatrix);
      }

      // camera uniforms
      if (shader.viewMatrixLocation) {
        gl.uniformMatrix4fv(shader.viewMatrixLocation, false, camera.viewMatrix);
      }
      if (shader.projectionMatrixLocation) {
        gl.uniformMatrix4fv(shader.projectionMatrixLocation, false, camera.projectionMatrix);
      }

      // material properties
      if (shader.colorLocation) {
        gl.uniform3f(shader.colorLocation, mesh.material.color[0], mesh.material.color[1], mesh.material.color[2]);
      }
      if (shader.opacityLocation) {
        gl.uniform1f(shader.opacityLocation, mesh.material.opacity);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, meshResources.vertexBuffer);
      gl.enableVertexAttribArray(shader.positionLocation);
      gl.vertexAttribPointer(shader.positionLocation, 3, gl.FLOAT, false, 0, 0);

      if (meshResources.indexBuffer && meshResources.indexCount) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshResources.indexBuffer);
        gl.drawElements(gl.TRIANGLES, meshResources.indexCount, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, meshResources.vertexCount);
      }
    }
  }

  clear(r: number, g: number, b: number, a: number): void {
    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height);
  }

  destroy(): void {
    // TODO: implement cleanup
  }
}
