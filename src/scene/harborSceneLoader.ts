import type { HarborSceneModule } from './harborSceneTypes';

export type SceneChunkImporter = () => Promise<HarborSceneModule>;

let cachedModulePromise: Promise<HarborSceneModule> | null = null;

/**
 * Dynamically loads the Three.js + HarborSceneController bundle on demand.
 * - Initial entry chunk never imports `three`, keeping first paint lightweight.
 * - On failure, clears the cached promise so a subsequent retry ("3D 를 다시 시도") can recover cleanly.
 */
export async function loadHarborSceneModule(
  importer?: SceneChunkImporter,
): Promise<HarborSceneModule> {
  if (importer) {
    return importer();
  }

  if (!cachedModulePromise) {
    cachedModulePromise = import('./HarborScene').catch((err) => {
      cachedModulePromise = null;
      throw err;
    });
  }

  return cachedModulePromise;
}

export function resetHarborSceneModuleCache(): void {
  cachedModulePromise = null;
}
