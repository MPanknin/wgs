import type { Renderer } from '../core/Renderer';
import type { Scene } from '../core/Scene';
import type { Camera } from '../core/Camera';
import { Shader } from '../core/Shader';
import { Mesh } from '../core/Mesh';
import { InstancedMesh } from '../core/InstancedMesh';

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

interface GLInstancedMeshResources extends GLMeshResources {
  instanceBuffer: WebGLBuffer;
  instanceCount: number;
}

export class WebGLRenderer implements Renderer {
  private gl: WebGLRenderingContext;
  private shaderResources = new WeakMap<Shader, GLShaderResources>();
  private meshResources = new WeakMap<Mesh, GLMeshResources>();
  private instancedMeshResources = new WeakMap<InstancedMesh, GLInstancedMeshResources>();
  private instancedExt: ANGLE_instanced_arrays | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl;

    this.instancedExt = gl.getExtension('ANGLE_instanced_arrays');

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

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

  private getOrCreateInstancedMeshResources(mesh: InstancedMesh): GLInstancedMeshResources {
    let resources = this.instancedMeshResources.get(mesh);
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

    const instanceBuffer = gl.createBuffer();
    if (!instanceBuffer) throw new Error('Failed to create instance buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.instanceData, gl.DYNAMIC_DRAW);

    resources = {
      vertexBuffer,
      indexBuffer,
      vertexCount,
      indexCount,
      instanceBuffer,
      instanceCount: mesh.instanceCount,
    };

    this.instancedMeshResources.set(mesh, resources);
    return resources;
  }

  render(scene: Scene, camera: Camera): void {
    const { gl } = this;

    scene.updateMatrixWorld();

    const objects = scene.getMeshes();

    for (const obj of objects) {

      if (obj instanceof InstancedMesh) {
        if (!obj.material?.shader || !this.instancedExt) {
          continue;
        }
        // todo: this needs to be exclusie only for splat meshes
        // sort instances if camera moved
        if (obj.shouldSort(camera.position)) {
          obj.sortInstances(camera.position);
        }

        const shader = this.getOrCreateShaderResources(obj.material.shader);
        const meshResources = this.getOrCreateInstancedMeshResources(obj);

        // re-upload instance buffer if it was sorted
        if (obj.needsBufferUpdate) {
          gl.bindBuffer(gl.ARRAY_BUFFER, meshResources.instanceBuffer);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, obj.instanceData);
          obj.needsBufferUpdate = false;
        }

        gl.useProgram(shader.program);

        if (shader.viewMatrixLocation) {
          gl.uniformMatrix4fv(shader.viewMatrixLocation, false, camera.viewMatrix);
        }
        if (shader.projectionMatrixLocation) {
          gl.uniformMatrix4fv(shader.projectionMatrixLocation, false, camera.projectionMatrix);
        }

        // viewport uniform for instanced shaders
        const viewportLocation = gl.getUniformLocation(shader.program, 'viewport');
        if (viewportLocation) {
          const vw = gl.drawingBufferWidth;
          const vh = gl.drawingBufferHeight;
          gl.uniform2f(viewportLocation, vw, vh);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, meshResources.vertexBuffer);
        gl.enableVertexAttribArray(shader.positionLocation);
        gl.vertexAttribPointer(shader.positionLocation, 3, gl.FLOAT, false, 0, 0);

        // bind instance buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, meshResources.instanceBuffer);

        // instance attributes (14 floats per instance: pos:3, rot:4, scale:3, color:3, opacity:1)
        const stride = 14 * 4; // 14 floats * 4 bytes

        const instancePosLoc = gl.getAttribLocation(shader.program, 'instancePosition');
        if (instancePosLoc !== -1) {
          gl.enableVertexAttribArray(instancePosLoc);
          gl.vertexAttribPointer(instancePosLoc, 3, gl.FLOAT, false, stride, 0);
          this.instancedExt.vertexAttribDivisorANGLE(instancePosLoc, 1);
        }

        const instanceRotLoc = gl.getAttribLocation(shader.program, 'instanceRotation');
        if (instanceRotLoc !== -1) {
          gl.enableVertexAttribArray(instanceRotLoc);
          gl.vertexAttribPointer(instanceRotLoc, 4, gl.FLOAT, false, stride, 12);
          this.instancedExt.vertexAttribDivisorANGLE(instanceRotLoc, 1);
        }

        const instanceScaleLoc = gl.getAttribLocation(shader.program, 'instanceScale');
        if (instanceScaleLoc !== -1) {
          gl.enableVertexAttribArray(instanceScaleLoc);
          gl.vertexAttribPointer(instanceScaleLoc, 3, gl.FLOAT, false, stride, 28);
          this.instancedExt.vertexAttribDivisorANGLE(instanceScaleLoc, 1);
        }

        const instanceColorLoc = gl.getAttribLocation(shader.program, 'instanceColor');
        if (instanceColorLoc !== -1) {
          gl.enableVertexAttribArray(instanceColorLoc);
          gl.vertexAttribPointer(instanceColorLoc, 3, gl.FLOAT, false, stride, 40);
          this.instancedExt.vertexAttribDivisorANGLE(instanceColorLoc, 1);
        }

        const instanceOpacityLoc = gl.getAttribLocation(shader.program, 'instanceOpacity');
        if (instanceOpacityLoc !== -1) {
          gl.enableVertexAttribArray(instanceOpacityLoc);
          gl.vertexAttribPointer(instanceOpacityLoc, 1, gl.FLOAT, false, stride, 52);
          this.instancedExt.vertexAttribDivisorANGLE(instanceOpacityLoc, 1);
        }

        // disable depth writes for proper alpha blending of splats
        gl.depthMask(false);

        // draw
        if (meshResources.indexBuffer && meshResources.indexCount) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshResources.indexBuffer);
          this.instancedExt.drawElementsInstancedANGLE(
            gl.TRIANGLES,
            meshResources.indexCount,
            gl.UNSIGNED_SHORT,
            0,
            meshResources.instanceCount
          );
        } else {
          this.instancedExt.drawArraysInstancedANGLE(
            gl.TRIANGLES,
            0,
            meshResources.vertexCount,
            meshResources.instanceCount
          );
        }

        if (instancePosLoc !== -1) this.instancedExt.vertexAttribDivisorANGLE(instancePosLoc, 0);
        if (instanceRotLoc !== -1) this.instancedExt.vertexAttribDivisorANGLE(instanceRotLoc, 0);
        if (instanceScaleLoc !== -1) this.instancedExt.vertexAttribDivisorANGLE(instanceScaleLoc, 0);
        if (instanceColorLoc !== -1) this.instancedExt.vertexAttribDivisorANGLE(instanceColorLoc, 0);
        if (instanceOpacityLoc !== -1) this.instancedExt.vertexAttribDivisorANGLE(instanceOpacityLoc, 0);

        // re-enable depth writes
        gl.depthMask(true);

      } else if (obj instanceof Mesh) {
        
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
