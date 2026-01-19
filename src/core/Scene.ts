import type { Mesh } from './Mesh';

export class Scene {
  meshes: Mesh[] = [];

  add(mesh: Mesh): void {
    this.meshes.push(mesh);
  }

  remove(mesh: Mesh): void {
    const index = this.meshes.indexOf(mesh);
    if (index !== -1) {
      this.meshes.splice(index, 1);
    }
  }
}
