import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import type { QualityTier } from './harborSceneTypes';

export interface OceanWaterSystem {
  group: THREE.Group;
  update: (elapsed: number, cameraTargetX?: number, cameraTargetZ?: number) => void;
  setQualityTier: (tier: QualityTier, reducedMotion: boolean) => void;
  setLowSpec: (lowSpec: boolean) => void;
  isLowSpec: () => boolean;
  setAtmosphere: (opts: {
    sunDir: THREE.Vector3;
    sunColor: number;
    deepColor: number;
    shallowColor: number;
    horizonColor: number;
    fogColor: number;
    fogDensity: number;
  }) => void;
  dispose: () => void;
}

const OCEAN_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uWaveHeight;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vWaveCrest;

  vec3 evalWave(vec2 p, float t) {
    float h = 0.0;
    float dHx = 0.0;
    float dHz = 0.0;

    float p1 = dot(p, vec2(0.09, 0.07)) + t * 1.1;
    float a1 = 0.14 * uWaveHeight;
    h += sin(p1) * a1;
    dHx += cos(p1) * a1 * 0.09;
    dHz += cos(p1) * a1 * 0.07;

    float p2 = dot(p, vec2(-0.15, 0.12)) + t * 1.45;
    float a2 = 0.08 * uWaveHeight;
    h += sin(p2) * a2;
    dHx += cos(p2) * a2 * (-0.15);
    dHz += cos(p2) * a2 * 0.12;

    return vec3(h, dHx, dHz);
  }

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec3 w = evalWave(worldPos.xz, uTime);
    worldPos.y += w.x;

    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(vec3(-w.y, 1.0, -w.z));
    vWaveCrest = clamp(w.x * 3.4 + 0.38, 0.0, 1.0);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyHorizonColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying float vWaveCrest;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = p * 2.04 + vec2(17.1, 31.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    vec2 uvA = vWorldPos.xz * 0.2 + vec2(uTime * 0.14, uTime * 0.09);
    vec2 uvB = vWorldPos.xz * 0.4 - vec2(uTime * 0.18, -uTime * 0.12);
    float n1 = fbm(uvA);
    float n2 = fbm(uvB);
    float nx = (n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.09;
    float nz = (fbm(uvA + vec2(4.2, 1.9)) - 0.5) * 0.14 + (fbm(uvB + vec2(2.7, 6.1)) - 0.5) * 0.09;
    vec3 N = normalize(vWorldNormal + vec3(nx, 0.0, nz));

    // Shoreline depth gradient & animated foam along infinite coastline (z ~ -2.5)
    float quayDist = abs(vWorldPos.z + 2.5);
    float shallowFactor = smoothstep(42.0, 1.0, quayDist);
    vec3 baseWater = mix(uDeepColor, uShallowColor, shallowFactor * 0.78);

    float cosTheta = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 4.4);
    vec3 reflectedSky = mix(uSkyHorizonColor * 0.85, uSkyHorizonColor * 1.12, clamp(1.0 - N.y, 0.0, 1.0));
    vec3 color = mix(baseWater, reflectedSky, fresnel * 0.74);

    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    color += uSunColor * (pow(ndh, 52.0) * 0.22 + pow(ndh, 320.0) * 1.05);

    float surge = sin(uTime * 1.55 + vWorldPos.x * 0.14) * 0.4;
    float foamNoise = fbm(vWorldPos.xz * 0.7 + vec2(uTime * 0.25, -uTime * 0.18));
    float quayFoamLine = smoothstep(3.0 + surge, 0.0, quayDist);
    float foamMask = clamp(quayFoamLine * smoothstep(0.24, 0.66, foamNoise + 0.26), 0.0, 0.85);
    color = mix(color, vec3(0.95, 0.98, 1.0), foamMask);

    float dist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Creates a 3-tier infinite ocean system:
 *   - 'high': Three.js `Water` planar mirror reflections + procedural normal-map waves (zero external CDN)
 *   - 'medium': Custom GLSL Fresnel + depth gradient + coastline foam shader
 *   - 'low': Lightweight Lambert ocean plane
 * Automatically follows camera focus in 200m snapped increments for an endless horizon.
 */
export function createMaritimeOcean(
  initialTier: QualityTier,
  waterNormals: THREE.CanvasTexture,
  initialReducedMotion = false,
): OceanWaterSystem {
  const group = new THREE.Group();

  // 1) High-tier reflective Three.js Water (bundled locally, zero CDN!)
  const waterGeo = new THREE.PlaneGeometry(6000, 6000);
  const reflectiveWater = new Water(waterGeo, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals,
    sunDirection: new THREE.Vector3(0.55, 0.65, 0.5).normalize(),
    sunColor: 0xffe4b8,
    waterColor: 0x052e59,
    distortionScale: 0.78,
    fog: true,
  });
  reflectiveWater.material.uniforms['size'].value = 6.5;
  // Preserve rich deep maritime navy ocean color while keeping crisp anti-aliased ship reflections (never milky grey!)
  reflectiveWater.material.fragmentShader = reflectiveWater.material.fragmentShader.replace(
    'vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), reflectionSample + specularLight, reflectance );',
    'vec3 deepOcean = waterColor * (0.95 + 0.55 * max( 0.0, dot( surfaceNormal, eyeDirection ) )) + sunColor * diffuseLight * 0.16; vec3 reflBlended = mix( waterColor * 1.15, reflectionSample, 0.42 ) + specularLight * 0.32; vec3 albedo = mix( deepOcean * getShadowMask(), reflBlended, clamp( reflectance * 0.38 + 0.12, 0.12, 0.38 ) );',
  );
  reflectiveWater.rotation.x = -Math.PI / 2;
  reflectiveWater.position.y = -0.04;
  group.add(reflectiveWater);

  // Subtle shoreline foam ribbon along the quay edge in High tier
  const foamGeo = new THREE.PlaneGeometry(220, 4.2);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xe6f4fb,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const shoreFoamMesh = new THREE.Mesh(foamGeo, foamMat);
  shoreFoamMesh.position.set(0, 0.04, -0.5);
  group.add(shoreFoamMesh);

  // 2) Medium/Low fallback plane with custom GLSL shader or Lambert
  const fallbackGeo = new THREE.PlaneGeometry(6000, 6000, 64, 64);
  fallbackGeo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.55, 0.65, 0.5).normalize() },
    uSunColor: { value: new THREE.Color(0xfff8e7) },
    uDeepColor: { value: new THREE.Color(0x0c4a6e) },
    uShallowColor: { value: new THREE.Color(0x137b96) },
    uSkyHorizonColor: { value: new THREE.Color(0xa9d2ee) },
    uFogColor: { value: new THREE.Color(0xc8dff2) },
    uFogDensity: { value: 0.0012 },
    uWaveHeight: { value: 1.0 },
  };

  const shaderMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    side: THREE.FrontSide,
  });

  const lowSpecMat = new THREE.MeshLambertMaterial({
    color: 0x0e547c,
    side: THREE.FrontSide,
  });

  const fallbackMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material> = new THREE.Mesh(
    fallbackGeo,
    shaderMat,
  );
  fallbackMesh.position.y = -0.05;
  group.add(fallbackMesh);

  let currentTier: QualityTier = initialTier;
  let reducedMotion = initialReducedMotion;

  const syncVisibility = () => {
    const useReflective = currentTier === 'high' && !reducedMotion;
    reflectiveWater.visible = useReflective;
    shoreFoamMesh.visible = useReflective;
    fallbackMesh.visible = !useReflective;
    if (!useReflective) {
      fallbackMesh.material = currentTier === 'low' || reducedMotion ? lowSpecMat : shaderMat;
    }
  };
  syncVisibility();

  return {
    group,
    update: (elapsed: number, cameraTargetX = 0, cameraTargetZ = 0) => {
      // Snap ocean center to 200m chunk grid around camera so water extends infinitely without jitter
      const snapX = Math.round(cameraTargetX / 200) * 200;
      const snapZ = Math.round(cameraTargetZ / 200) * 200;
      reflectiveWater.position.x = snapX;
      reflectiveWater.position.z = snapZ;
      fallbackMesh.position.x = snapX;
      fallbackMesh.position.z = snapZ;
      shoreFoamMesh.position.x = snapX;

      if (reducedMotion || currentTier === 'low') return;
      if (reflectiveWater.visible) {
        reflectiveWater.material.uniforms['time'].value = elapsed * 0.55;
        shoreFoamMesh.position.z = -0.5 + Math.sin(elapsed * 1.4) * 0.35;
      } else {
        uniforms.uTime.value = elapsed;
      }
    },
    setQualityTier: (tier: QualityTier, nextReducedMotion: boolean) => {
      currentTier = tier;
      reducedMotion = nextReducedMotion;
      syncVisibility();
    },
    setLowSpec: (lowSpec: boolean) => {
      currentTier = lowSpec ? 'low' : 'high';
      syncVisibility();
    },
    isLowSpec: () => currentTier === 'low' || reducedMotion,
    setAtmosphere: (opts) => {
      uniforms.uSunDir.value.copy(opts.sunDir).normalize();
      uniforms.uSunColor.value.setHex(opts.sunColor);
      uniforms.uDeepColor.value.setHex(opts.deepColor);
      uniforms.uShallowColor.value.setHex(opts.shallowColor);
      uniforms.uSkyHorizonColor.value.setHex(opts.horizonColor);
      uniforms.uFogColor.value.setHex(opts.fogColor);
      uniforms.uFogDensity.value = opts.fogDensity;
      lowSpecMat.color.setHex(opts.deepColor);

      const wUniforms = reflectiveWater.material.uniforms;
      if (wUniforms['sunDirection']) {
        (wUniforms['sunDirection'].value as THREE.Vector3).copy(opts.sunDir).normalize();
      }
      if (wUniforms['sunColor']) {
        (wUniforms['sunColor'].value as THREE.Color).setHex(opts.sunColor);
      }
      if (wUniforms['waterColor']) {
        (wUniforms['waterColor'].value as THREE.Color).setHex(opts.deepColor);
      }
    },
    dispose: () => {
      waterGeo.dispose();
      reflectiveWater.material.dispose();
      foamGeo.dispose();
      foamMat.dispose();
      fallbackGeo.dispose();
      shaderMat.dispose();
      lowSpecMat.dispose();
    },
  };
}
