import * as THREE from 'three';

export const OCCLUDED_SUPERSTRUCTURE_OPACITY = 0.25;
/** Stage 12: Opacity applied to vertical harbor props (lamp posts, flagpoles, pillars, scaffolding, signboards) occluding camera -> character sightline. */
export const OCCLUDED_VERTICAL_PROP_OPACITY = 0.15;

export interface OcclusionUpdateOptions {
  /** Extra horizontal corridor radius (meters) around the camera->target segment so slim vertical poles near the character's head/body never slip past center raycasts. */
  corridorRadius?: number;
  /** Additional vertical target offsets (meters, e.g. head +1.15, legs -1.05) probed along with targetPos. */
  verticalProbeOffsets?: readonly number[];
}

interface SavedMaterialState {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

/**
 * Dynamically fades ship upper superstructures (`0.25`) or vertical harbor props (`0.15`)
 * that sit on the line of sight between the camera and its orbit/focus target, and restores
 * their exact original material state once the sightline clears.
 *
 * Pre-allocates all scratch vectors/boxes/raycasters for zero per-frame GC churn.
 */
export class SuperstructureOcclusionController {
  private readonly raycaster = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly probeTarget = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly scratchBox = new THREE.Box3();
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
    fadeOpacity = OCCLUDED_SUPERSTRUCTURE_OPACITY,
    options?: OcclusionUpdateOptions,
  ): string[] {
    this.hitSet.clear();

    if (occludables.length > 0) {
      this.origin.copy(cameraPos);
      const offsets =
        options?.verticalProbeOffsets && options.verticalProbeOffsets.length > 0
          ? options.verticalProbeOffsets
          : [0];

      // 1. Raycast along camera -> target (plus optional head/torso/leg vertical probes)
      for (let oi = 0; oi < offsets.length; oi += 1) {
        this.probeTarget.set(targetPos.x, targetPos.y + offsets[oi], targetPos.z);
        this.dir.subVectors(this.probeTarget, cameraPos);
        const distance = this.dir.length();
        if (distance <= 0.8) continue;

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

      // 2. Optional sightline-corridor test for slim vertical props (poles, masts, sign frames, scaffolding)
      const corridorRadius = options?.corridorRadius ?? 0;
      if (corridorRadius > 0) {
        const segDx = targetPos.x - cameraPos.x;
        const segDy = targetPos.y - cameraPos.y;
        const segDz = targetPos.z - cameraPos.z;
        const segHorizSq = segDx * segDx + segDz * segDz;
        if (segHorizSq > 0.64) {
          for (let i = 0; i < occludables.length; i += 1) {
            const obj = occludables[i];
            if (this.hitSet.has(obj)) continue;
            this.scratchBox.setFromObject(obj);
            if (this.scratchBox.isEmpty()) continue;

            // Project box center onto horizontal camera->target segment
            const cx = (this.scratchBox.min.x + this.scratchBox.max.x) * 0.5;
            const cz = (this.scratchBox.min.z + this.scratchBox.max.z) * 0.5;
            const tRaw = ((cx - cameraPos.x) * segDx + (cz - cameraPos.z) * segDz) / segHorizSq;
            if (tRaw <= 0.03 || tRaw >= 0.94) continue;

            const closestX = cameraPos.x + segDx * tRaw;
            const closestZ = cameraPos.z + segDz * tRaw;
            const clampedX = Math.max(this.scratchBox.min.x, Math.min(closestX, this.scratchBox.max.x));
            const clampedZ = Math.max(this.scratchBox.min.z, Math.min(closestZ, this.scratchBox.max.z));
            const horizDist = Math.hypot(closestX - clampedX, closestZ - clampedZ);
            if (horizDist > corridorRadius) continue;

            // Verify prop's vertical extent overlaps the sightline band between camera and full character height
            const rayYAtProp = cameraPos.y + segDy * tRaw;
            const bandLowY = Math.min(rayYAtProp, targetPos.y) - 1.45;
            const bandHighY = Math.max(rayYAtProp, targetPos.y) + 1.45;
            if (this.scratchBox.max.y >= bandLowY && this.scratchBox.min.y <= bandHighY) {
              this.hitSet.add(obj);
            }
          }
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
        this.fadeObject(next, fadeOpacity);
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
