import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import { Shader } from '../core/Shader';
import { Mesh } from '../core/Mesh';
import { SplatMesh } from '../core/SplatMesh';
import { splatVertexGLSL, splatFragmentGLSL } from '../core/SplatShaders';

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

interface GLSplatProgram {
  program: WebGLProgram;
  splats: WebGLUniformLocation | null;
  viewMatrix: WebGLUniformLocation | null;
  projectionMatrix: WebGLUniformLocation | null;
  viewport: WebGLUniformLocation | null;
  invCovScale: WebGLUniformLocation | null;
}

interface GLSplatResources {
  vao: WebGLVertexArrayObject;
  texture: WebGLTexture;
  orderBuffer: WebGLBuffer;
}

const SPLAT_INDEX_LOCATION = 0;
const SPLAT_TEXTURE_WIDTH = 4096;

export class WebGLRenderer implements Renderer {
  private gl: WebGL2RenderingContext;
  private shaderResources = new WeakMap<Shader, GLShaderResources>();
  private meshResources = new WeakMap<Mesh, GLMeshResources>();
  private splatResources = new WeakMap<SplatMesh, GLSplatResources>();
  private splatProgram: GLSplatProgram | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.enable(gl.BLEND);
    // same as WebGPU: keep destination alpha at 1 so the canvas stays opaque
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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

  private compileShader(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  private getOrCreateSplatProgram(): GLSplatProgram {
    if (this.splatProgram) return this.splatProgram;

    const { gl } = this;
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');
    gl.attachShader(program, this.compileShader(gl.VERTEX_SHADER, splatVertexGLSL));
    gl.attachShader(program, this.compileShader(gl.FRAGMENT_SHADER, splatFragmentGLSL));
    gl.bindAttribLocation(program, SPLAT_INDEX_LOCATION, 'splatIndex');
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
    }

    this.splatProgram = {
      program,
      splats: gl.getUniformLocation(program, 'splats'),
      viewMatrix: gl.getUniformLocation(program, 'viewMatrix'),
      projectionMatrix: gl.getUniformLocation(program, 'projectionMatrix'),
      viewport: gl.getUniformLocation(program, 'viewport'),
      invCovScale: gl.getUniformLocation(program, 'invCovScale'),
    };
    return this.splatProgram;
  }

  private getOrCreateSplatResources(mesh: SplatMesh): GLSplatResources {
    let resources = this.splatResources.get(mesh);
    if (resources) return resources;

    const { gl } = this;

    // packed splats as RGBA32UI, 2 texels per splat; even width keeps a splat in one row
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const width = Math.min(SPLAT_TEXTURE_WIDTH, maxSize) & ~1;
    const height = Math.max(1, Math.ceil((mesh.count * 2) / width));
    if (height > maxSize) {
      throw new Error(`${mesh.count} splats exceed the max texture size ${maxSize}`);
    }
    const texels = new Uint32Array(width * height * 4);
    texels.set(mesh.packed);

    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create splat texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, width, height);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, texels);

    // sorted splat indices, one per instance
    const vao = gl.createVertexArray();
    const orderBuffer = gl.createBuffer();
    if (!vao || !orderBuffer) throw new Error('Failed to create splat order buffer');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, orderBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.order, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(SPLAT_INDEX_LOCATION);
    gl.vertexAttribIPointer(SPLAT_INDEX_LOCATION, 1, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(SPLAT_INDEX_LOCATION, 1);
    gl.bindVertexArray(null);
    mesh.needsOrderUpload = false;

    resources = { vao, texture, orderBuffer };
    this.splatResources.set(mesh, resources);
    return resources;
  }

  private renderSplats(mesh: SplatMesh, camera: Camera): void {
    if (mesh.count === 0) return;

    const { gl } = this;

    mesh.sort(camera.position);

    const program = this.getOrCreateSplatProgram();
    const resources = this.getOrCreateSplatResources(mesh);

    if (mesh.needsOrderUpload) {
      gl.bindBuffer(gl.ARRAY_BUFFER, resources.orderBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.order);
      mesh.needsOrderUpload = false;
    }

    gl.useProgram(program.program);
    gl.uniformMatrix4fv(program.viewMatrix, false, camera.viewMatrix);
    gl.uniformMatrix4fv(program.projectionMatrix, false, camera.projectionMatrix);
    gl.uniform2f(program.viewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(program.invCovScale, 1 / mesh.covScale);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.texture);
    gl.uniform1i(program.splats, 0);

    // splats are alpha blended back to front, no depth writes
    gl.depthMask(false);
    gl.bindVertexArray(resources.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mesh.count);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  render(scene: Scene, camera: Camera): void {
    const { gl } = this;

    scene.updateMatrixWorld();

    const objects = scene.getMeshes();

    for (const obj of objects) {

      if (obj instanceof Mesh) {
        
        if (!obj.material?.shader) {
          continue;
        }

        const shader = this.getOrCreateShaderResources(obj.material.shader);
        const meshResources = this.getOrCreateMeshResources(obj);

        gl.useProgram(shader.program);

        // model matrix
        if (shader.modelMatrixLocation) {
          gl.uniformMatrix4fv(shader.modelMatrixLocation, false, obj.worldMatrix);
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
          gl.uniform3f(shader.colorLocation, obj.material.color[0], obj.material.color[1], obj.material.color[2]);
        }
        if (shader.opacityLocation) {
          gl.uniform1f(shader.opacityLocation, obj.material.opacity);
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

    // splats last, blended over the opaque meshes
    scene.traverse((obj) => {
      if (obj instanceof SplatMesh) this.renderSplats(obj, camera);
    });
  }

  clear(r: number, g: number, b: number, a: number): void {
    const { gl } = this;
    gl.clearColor(r, g, b, a);
    gl.depthMask(true); // ensure depth buffer can be cleared
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height);
  }

  destroy(): void {
    // TODO: implement cleanup
  }
}
