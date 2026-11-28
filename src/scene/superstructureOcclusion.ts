import * as THREE from 'three';

export const OCCLUDED_SUPERSTRUCTURE_OPACITY = 0.25;

interface SavedMaterialState {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/**
 * Dynamically fades ship upper superstructures that sit on the line of sight
 * between the camera and its orbit/focus target (opacity = 0.25), and restores
 * their exact original material state once the sightline clears.
 *
 * Pre-allocates all scratch vectors/raycasters for zero per-frame GC churn.
 */
export class SuperstructureOcclusionController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly activeOccluded = new Set<THREE.Object3D>();
  private readonly savedStates = new WeakMap<THREE.Material, SavedMaterialState>();
  private readonly hitSet = new Set<THREE.Object3D>();

  /**
   * Tests the segment from `cameraPos` to `targetPos` against `occludables`.
   * Returns the list of currently faded occludable names (for diagnostics/tests).
   */
  public update(
    cameraPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    occludables: readonly THREE.Object3D[],
  ): string[] {
    this.hitSet.clear();

    if (occludables.length > 0) {
      this.origin.copy(cameraPos);
      this.dir.subVectors(targetPos, cameraPos);
      const distance = this.dir.length();
      if (distance > 0.8) {
        this.dir.divideScalar(distance);
        this.raycaster.set(this.origin, this.dir);
        this.raycaster.near = 0.2;
        this.raycaster.far = Math.max(0.25, distance - 0.55);

        const hits = this.raycaster.intersectObjects(occludables as THREE.Object3D[], true);
        for (let i = 0; i < hits.length; i += 1) {
          const owner = this.findOccluderRoot(hits[i].object, occludables);
          if (owner) this.hitSet.add(owner);
        }
      }
    }

    // Restore groups that are no longer occluding the sightline
    for (const prev of Array.from(this.activeOccluded)) {
      if (!this.hitSet.has(prev)) {
        this.restoreObject(prev);
        this.activeOccluded.delete(prev);
      }
    }

    // Apply translucency to newly occluding groups
    for (const next of this.hitSet) {
      if (!this.activeOccluded.has(next)) {
        this.fadeObject(next, OCCLUDED_SUPERSTRUCTURE_OPACITY);
        this.activeOccluded.add(next);
      }
    }

    const activeNames: string[] = [];
    for (const obj of this.activeOccluded) {
      activeNames.push(obj.name || 'ship_superstructure');
    }
    return activeNames;
  }

  public restoreAll(): void {
    for (const obj of this.activeOccluded) {
      this.restoreObject(obj);
    }
    this.activeOccluded.clear();
  }

  public getOccludedCount(): number {
    return this.activeOccluded.size;
  }

  private findOccluderRoot(
    hitObject: THREE.Object3D,
    occludables: readonly THREE.Object3D[],
  ): THREE.Object3D | null {
    let curr: THREE.Object3D | null = hitObject;
    while (curr) {
      for (let i = 0; i < occludables.length; i += 1) {
        if (occludables[i] === curr) return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  private fadeObject(root: THREE.Object3D, opacity: number): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < mats.length; i += 1) {
        const mat = mats[i];
        if (!mat) continue;
        if (!this.savedStates.has(mat)) {
          this.savedStates.set(mat, {
            opacity: mat.opacity,
            transparent: mat.transparent,
            depthWrite: mat.depthWrite,
          });
        }
        mat.transparent = true;
        mat.opacity = opacity;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      }
    });
  }

  private restoreObject(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < mats.length; i += 1) {
        const mat = mats[i];
        if (!mat) continue;
        const saved = this.savedStates.get(mat);
        if (!saved) continue;
        mat.opacity = saved.opacity;
        mat.transparent = saved.transparent;
        mat.depthWrite = saved.depthWrite;
        mat.needsUpdate = true;
      }
    });
  }
}
