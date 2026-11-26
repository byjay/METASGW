import * as THREE from 'three';

export interface OceanUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uDeepColor: THREE.IUniform<THREE.Color>;
  uShallowColor: THREE.IUniform<THREE.Color>;
  uSkyHorizonColor: THREE.IUniform<THREE.Color>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogDensity: THREE.IUniform<number>;
  uWaveHeight: THREE.IUniform<number>;
}

export interface OceanWaterSystem {
  mesh: THREE.Mesh;
  uniforms: OceanUniforms;
  update: (elapsed: number) => void;
  setLowSpec: (lowSpec: boolean) => void;
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

    float p1 = dot(p, vec2(0.11, 0.08)) + t * 1.15;
    float a1 = 0.14 * uWaveHeight;
    h += sin(p1) * a1;
    dHx += cos(p1) * a1 * 0.11;
    dHz += cos(p1) * a1 * 0.08;

    float p2 = dot(p, vec2(-0.17, 0.14)) + t * 1.48;
    float a2 = 0.085 * uWaveHeight;
    h += sin(p2) * a2;
    dHx += cos(p2) * a2 * (-0.17);
    dHz += cos(p2) * a2 * 0.14;

    float p3 = dot(p, vec2(0.28, -0.24)) + t * 2.15;
    float a3 = 0.045 * uWaveHeight;
    h += sin(p3) * a3;
    dHx += cos(p3) * a3 * 0.28;
    dHz += cos(p3) * a3 * (-0.24);

    return vec3(h, dHx, dHz);
  }

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec3 w = evalWave(worldPos.xz, uTime);
    worldPos.y += w.x;

    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(vec3(-w.y, 1.0, -w.z));
    vWaveCrest = clamp(w.x * 3.2 + 0.35, 0.0, 1.0);

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

    vec2 uvA = vWorldPos.xz * 0.22 + vec2(uTime * 0.14, uTime * 0.09);
    vec2 uvB = vWorldPos.xz * 0.44 - vec2(uTime * 0.18, -uTime * 0.12);
    float n1 = fbm(uvA);
    float n2 = fbm(uvB);
    float nx = (n1 - 0.5) * 0.13 + (n2 - 0.5) * 0.09;
    float nz = (fbm(uvA + vec2(4.2, 1.9)) - 0.5) * 0.13 + (fbm(uvB + vec2(2.7, 6.1)) - 0.5) * 0.09;
    vec3 N = normalize(vWorldNormal + vec3(nx, 0.0, nz));

    // Coastal depth gradient near quay wall (z ~ -2.5) and East/West piers (+/-75)
    float quayDist = abs(vWorldPos.z + 2.5);
    float pierDist = min(abs(vWorldPos.x + 75.5), abs(vWorldPos.x - 75.5));
    float shallowFactor = max(
      smoothstep(42.0, 1.5, quayDist) * step(-96.0, vWorldPos.x) * step(vWorldPos.x, 96.0),
      smoothstep(22.0, 1.5, pierDist) * step(-4.0, vWorldPos.z) * step(vWorldPos.z, 40.0) * 0.85
    );
    vec3 baseWater = mix(uDeepColor, uShallowColor, shallowFactor * 0.78);

    float sss = pow(clamp(dot(V, -L + N * 0.35), 0.0, 1.0), 3.0) * vWaveCrest;
    baseWater += vec3(0.05, 0.25, 0.29) * sss * 0.65;

    float cosTheta = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - cosTheta, 4.2);
    vec3 reflectedSky = mix(uSkyHorizonColor * 0.86, uSkyHorizonColor * 1.1, clamp(1.0 - N.y, 0.0, 1.0));
    vec3 color = mix(baseWater, reflectedSky, fresnel * 0.7);

    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    color += uSunColor * (pow(ndh, 54.0) * 0.2 + pow(ndh, 340.0) * 1.05);

    // Shoreline quay & pier foam
    float foamNoise = fbm(vWorldPos.xz * 0.68 + vec2(uTime * 0.26, -uTime * 0.18));
    float quayFoamLine = smoothstep(2.6, 0.0, abs(vWorldPos.z + 2.5)) * step(-94.0, vWorldPos.x) * step(vWorldPos.x, 94.0);
    float westPierFoam = smoothstep(2.4, 0.0, abs(vWorldPos.x + 75.5)) * step(-3.0, vWorldPos.z) * step(vWorldPos.z, 38.0);
    float eastPierFoam = smoothstep(2.4, 0.0, abs(vWorldPos.x - 75.5)) * step(-3.0, vWorldPos.z) * step(vWorldPos.z, 38.0);
    float foamMask = clamp((quayFoamLine + westPierFoam * 0.85 + eastPierFoam * 0.85) * smoothstep(0.28, 0.68, foamNoise + 0.22), 0.0, 0.85);
    color = mix(color, vec3(0.93, 0.97, 1.0), foamMask);

    color *= (0.95 + 0.09 * n1);

    float dist = length(cameraPosition - vWorldPos);
    float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createMaritimeOcean(isSoftwareGl: boolean): OceanWaterSystem {
  const segs = isSoftwareGl ? 36 : 84;
  const geo = new THREE.PlaneGeometry(820, 820, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const uniforms: OceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.55, 0.36, -0.75).normalize() },
    uSunColor: { value: new THREE.Color(0xfff0d4) },
    uDeepColor: { value: new THREE.Color(0x0c4a6e) },
    uShallowColor: { value: new THREE.Color(0x117a96) },
    uSkyHorizonColor: { value: new THREE.Color(0x9ec9e6) },
    uFogColor: { value: new THREE.Color(0xc2d8ea) },
    uFogDensity: { value: 0.002 },
    uWaveHeight: { value: 1.0 },
  };

  const shaderMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    side: THREE.FrontSide,
  });

  const lowSpecMat = new THREE.MeshLambertMaterial({
    color: 0x0e5e8c,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geo, isSoftwareGl ? lowSpecMat : shaderMat);
  mesh.position.y = -0.05;
  mesh.renderOrder = 0;

  let lowSpecActive = isSoftwareGl;

  return {
    mesh,
    uniforms,
    update: (elapsed: number) => {
      if (!lowSpecActive) {
        uniforms.uTime.value = elapsed;
      }
    },
    setLowSpec: (lowSpec: boolean) => {
      lowSpecActive = lowSpec;
      mesh.material = lowSpec ? lowSpecMat : shaderMat;
    },
    setAtmosphere: (opts) => {
      uniforms.uSunDir.value.copy(opts.sunDir).normalize();
      uniforms.uSunColor.value.setHex(opts.sunColor);
      uniforms.uDeepColor.value.setHex(opts.deepColor);
      uniforms.uShallowColor.value.setHex(opts.shallowColor);
      uniforms.uSkyHorizonColor.value.setHex(opts.horizonColor);
      uniforms.uFogColor.value.setHex(opts.fogColor);
      uniforms.uFogDensity.value = opts.fogDensity;
      lowSpecMat.color.setHex(opts.deepColor);
    },
    dispose: () => {
      geo.dispose();
      shaderMat.dispose();
      lowSpecMat.dispose();
    },
  };
}
