import { Object3D } from './Object3D';
import type { Mesh } from './Mesh';

export class Scene extends Object3D {
  add(object: Object3D): void {
    this.addChild(object);
  }

  getMeshes(): Mesh[] {
    const meshes: Mesh[] = [];
    this.traverse((obj) => {
      if (obj instanceof Object3D && 'material' in obj) {
        meshes.push(obj as Mesh);
      }
    });
    return meshes;
  }

  private traverse(callback: (obj: Object3D) => void): void {
    callback(this);
    this.traverseChildren(this, callback);
  }

  private traverseChildren(obj: Object3D, callback: (obj: Object3D) => void): void {
    for (const child of obj.children) {
      callback(child);

      this.traverseChildren(child, callback);
    }
  }
}
