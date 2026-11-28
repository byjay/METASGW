import * as THREE from 'three';

export interface HarborTexturePack {
  concreteAlbedo: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  concreteRoughness: THREE.CanvasTexture;
  asphaltRoad: THREE.CanvasTexture;
  hazardTrim: THREE.CanvasTexture;
  containerRib: THREE.CanvasTexture;
  containerRibBump: THREE.CanvasTexture;
  containerRibRoughness: THREE.CanvasTexture;
  curtainWall: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  craneBannerOrange: THREE.CanvasTexture;
  craneBannerBlue: THREE.CanvasTexture;
  hullSteelPlates: THREE.CanvasTexture;
  waterNormals: THREE.CanvasTexture;
  cloudPuff: THREE.CanvasTexture;
  usedOffscreenCanvas: boolean;
  createSignboard: (title: string, subtitle: string, accentHex: string) => THREE.CanvasTexture;
  createHubBuildingSignboard: (
    title: string,
    statusBanner: string,
    accentHex: string,
    isPlanned: boolean,
  ) => THREE.CanvasTexture;
  createAvatarBillboardIcon: (accentHex: string, online: boolean, isCurrentUser: boolean) => THREE.CanvasTexture;
  dispose: () => void;
}

type ProceduralCanvas = OffscreenCanvas | HTMLCanvasElement;
type ProceduralCtx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeProceduralCanvas(
  width: number,
  height: number,
): { canvas: ProceduralCanvas; ctx: ProceduralCtx2D; isOffscreen: boolean } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      return { canvas: offscreen, ctx, isOffscreen: true };
    }
  }
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d')!;
  return { canvas: el, ctx, isOffscreen: false };
}

function toCanvasTexture(canvas: ProceduralCanvas): THREE.CanvasTexture {
  return new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
}

/**
 * Generates a tileable 512x512 isotropic tangent-space water wave normal map via 16 balanced
 * multi-directional periodic waves with full trilinear mipmapping and high anisotropy so
 * Three.js `Water` renders natural harbor ripples with zero diagonal striping or aliasing.
 */
function buildProceduralWaterNormalTexture(anisotropy: number): {
  tex: THREE.CanvasTexture;
  isOffscreen: boolean;
} {
  const size = 512;
  const surface = makeProceduralCanvas(size, size);
  const ctx = surface.ctx;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  // 16 isotropic periodic wave octaves spanning all compass directions (integer freqs = seamless wrap)
  const waves = [
    { fx: 2, fy: 0, amp: 0.14, ph: 0.3 },
    { fx: 0, fy: 2, amp: 0.14, ph: 1.9 },
    { fx: 2, fy: 2, amp: 0.11, ph: 4.1 },
    { fx: -2, fy: 2, amp: 0.11, ph: 2.6 },
    { fx: 3, fy: 1, amp: 0.095, ph: 0.8 },
    { fx: -1, fy: 3, amp: 0.095, ph: 3.4 },
    { fx: 3, fy: -2, amp: 0.085, ph: 5.1 },
    { fx: -3, fy: -1, amp: 0.085, ph: 1.2 },
    { fx: 5, fy: 2, amp: 0.065, ph: 2.2 },
    { fx: -2, fy: 5, amp: 0.065, ph: 4.8 },
    { fx: 4, fy: -4, amp: 0.058, ph: 0.5 },
    { fx: 4, fy: 4, amp: 0.058, ph: 3.7 },
    { fx: 7, fy: -3, amp: 0.042, ph: 1.5 },
    { fx: -3, fy: 7, amp: 0.042, ph: 5.5 },
    { fx: 9, fy: 4, amp: 0.028, ph: 2.9 },
    { fx: -4, fy: -9, amp: 0.028, ph: 0.1 },
  ];

  const TWO_PI = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      let dhdu = 0;
      let dhdv = 0;
      for (let w = 0; w < waves.length; w += 1) {
        const wave = waves[w];
        const angle = TWO_PI * (wave.fx * u + wave.fy * v) + wave.ph;
        const c = Math.cos(angle) * wave.amp;
        dhdu += c * wave.fx;
        dhdv += c * wave.fy;
      }
      // Subtle capillary tangent-space normal (-dH/du, -dH/dv, 1) normalized & packed into [0..255]
      const nx = -dhdu * 0.12;
      const ny = -dhdv * 0.12;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round((nx * invLen * 0.5 + 0.5) * 255)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * invLen * 0.5 + 0.5) * 255)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round((nz * invLen * 0.5 + 0.5) * 255)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = toCanvasTexture(surface.canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return { tex, isOffscreen: surface.isOffscreen };
}

/**
 * Generates all 3D PBR textures procedurally via OffscreenCanvas (zero external CDN calls).
 */
export function createHarborTextures(maxAnisotropy: number): HarborTexturePack {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 16));
  const dynamicTextures: THREE.CanvasTexture[] = [];
  const billboardIconCache = new Map<string, THREE.CanvasTexture>();
  let usedOffscreenCanvas = false;

  let seed = 4201;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // 1. Quay Heavy Concrete Albedo (expansion joints + subtle weathering + aggregate grain)
  const cSurface = makeProceduralCanvas(512, 512);
  usedOffscreenCanvas = usedOffscreenCanvas || cSurface.isOffscreen;
  const cCtx = cSurface.ctx;

  cCtx.fillStyle = '#9aa5b2';
  cCtx.fillRect(0, 0, 512, 512);

  for (let sy = 0; sy < 4; sy += 1) {
    for (let sx = 0; sx < 4; sx += 1) {
      const toneDelta = Math.floor((rand() - 0.5) * 10);
      const base = 152 + toneDelta;
      cCtx.fillStyle = `rgb(${base}, ${base + 6}, ${base + 12})`;
      cCtx.fillRect(sx * 128 + 2, sy * 128 + 2, 124, 124);
    }
  }

  cCtx.strokeStyle = 'rgba(30, 41, 59, 0.42)';
  cCtx.lineWidth = 2.5;
  for (let i = 0; i <= 512; i += 128) {
    cCtx.beginPath();
    cCtx.moveTo(i, 0);
    cCtx.lineTo(i, 512);
    cCtx.stroke();
    cCtx.beginPath();
    cCtx.moveTo(0, i);
    cCtx.lineTo(512, i);
    cCtx.stroke();
  }

  for (let i = 0; i < 48; i += 1) {
    const rx = rand() * 512;
    const ry = rand() * 512;
    const rad = 18 + rand() * 40;
    const g = cCtx.createRadialGradient(rx, ry, 2, rx, ry, rad);
    const kind = rand();
    if (kind < 0.5) {
      g.addColorStop(0, 'rgba(30, 41, 59, 0.11)');
    } else {
      g.addColorStop(0, 'rgba(226, 232, 240, 0.11)');
    }
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cCtx.fillStyle = g;
    cCtx.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
  }

  for (let i = 0; i < 3200; i += 1) {
    const shade = Math.floor(110 + rand() * 68);
    cCtx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 8}, 0.22)`;
    cCtx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }

  cCtx.fillStyle = 'rgba(234, 179, 8, 0.48)';
  cCtx.fillRect(0, 446, 512, 6);
  cCtx.fillStyle = 'rgba(226, 232, 240, 0.36)';
  for (let x = 0; x < 512; x += 64) {
    cCtx.fillRect(x + 8, 250, 32, 4);
  }

  const concreteAlbedo = toCanvasTexture(cSurface.canvas);
  concreteAlbedo.colorSpace = THREE.SRGBColorSpace;
  concreteAlbedo.wrapS = THREE.RepeatWrapping;
  concreteAlbedo.wrapT = THREE.RepeatWrapping;
  concreteAlbedo.repeat.set(9, 2.2);
  concreteAlbedo.anisotropy = anisotropy;

  // 2. Concrete Bump Map + Roughness Map
  const bSurface = makeProceduralCanvas(256, 256);
  const bCtx = bSurface.ctx;
  bCtx.fillStyle = '#848484';
  bCtx.fillRect(0, 0, 256, 256);
  bCtx.strokeStyle = '#2a2a2a';
  bCtx.lineWidth = 2.5;
  for (let i = 0; i <= 256; i += 64) {
    bCtx.beginPath();
    bCtx.moveTo(i, 0);
    bCtx.lineTo(i, 256);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(0, i);
    bCtx.lineTo(256, i);
    bCtx.stroke();
  }
  for (let i = 0; i < 2000; i += 1) {
    const v = Math.floor(94 + rand() * 74);
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  const concreteBump = toCanvasTexture(bSurface.canvas);
  concreteBump.wrapS = THREE.RepeatWrapping;
  concreteBump.wrapT = THREE.RepeatWrapping;
  concreteBump.repeat.set(9, 2.2);

  const crSurface = makeProceduralCanvas(256, 256);
  const crCtx = crSurface.ctx;
  crCtx.fillStyle = '#d4d4d4';
  crCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 32; i += 1) {
    const rx = rand() * 256;
    const ry = rand() * 256;
    const rad = 10 + rand() * 26;
    const g = crCtx.createRadialGradient(rx, ry, 1, rx, ry, rad);
    g.addColorStop(0, 'rgba(135, 135, 135, 0.5)');
    g.addColorStop(1, 'rgba(212, 212, 212, 0)');
    crCtx.fillStyle = g;
    crCtx.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
  }
  crCtx.strokeStyle = '#f8f8f8';
  crCtx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    crCtx.beginPath();
    crCtx.moveTo(i, 0);
    crCtx.lineTo(i, 256);
    crCtx.stroke();
    crCtx.beginPath();
    crCtx.moveTo(0, i);
    crCtx.lineTo(256, i);
    crCtx.stroke();
  }
  const concreteRoughness = toCanvasTexture(crSurface.canvas);
  concreteRoughness.wrapS = THREE.RepeatWrapping;
  concreteRoughness.wrapT = THREE.RepeatWrapping;
  concreteRoughness.repeat.set(9, 2.2);

  // 3. Dark Shipyard Asphalt / Rear Apron
  const aSurface = makeProceduralCanvas(256, 256);
  const aCtx = aSurface.ctx;
  aCtx.fillStyle = '#334155';
  aCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i += 1) {
    const v = Math.floor(38 + rand() * 40);
    aCtx.fillStyle = `rgba(${v},${v + 5},${v + 12},0.38)`;
    aCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  const asphaltRoad = toCanvasTexture(aSurface.canvas);
  asphaltRoad.colorSpace = THREE.SRGBColorSpace;
  asphaltRoad.wrapS = THREE.RepeatWrapping;
  asphaltRoad.wrapT = THREE.RepeatWrapping;
  asphaltRoad.repeat.set(10, 3);
  asphaltRoad.anisotropy = anisotropy;

  // 4. Maritime Safety Quay Trim (Yellow & Charcoal Chevron)
  const hSurface = makeProceduralCanvas(256, 64);
  const hCtx = hSurface.ctx;
  hCtx.fillStyle = '#d99a1e';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#182230';
  for (let x = -64; x < 320; x += 48) {
    hCtx.beginPath();
    hCtx.moveTo(x, 64);
    hCtx.lineTo(x + 24, 64);
    hCtx.lineTo(x + 48, 0);
    hCtx.lineTo(x + 24, 0);
    hCtx.closePath();
    hCtx.fill();
  }
  const hazardTrim = toCanvasTexture(hSurface.canvas);
  hazardTrim.colorSpace = THREE.SRGBColorSpace;
  hazardTrim.wrapS = THREE.RepeatWrapping;
  hazardTrim.wrapT = THREE.RepeatWrapping;
  hazardTrim.repeat.set(18, 1);
  hazardTrim.anisotropy = anisotropy;

  // 5. Corrugated Container Steel Bump + Roughness
  const rbSurface = makeProceduralCanvas(128, 128);
  const rbCtx = rbSurface.ctx;
  rbCtx.fillStyle = '#808080';
  rbCtx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    const ribGrad = rbCtx.createLinearGradient(x, 0, x + 8, 0);
    ribGrad.addColorStop(0, '#383838');
    ribGrad.addColorStop(0.25, '#dcdcdc');
    ribGrad.addColorStop(0.55, '#dcdcdc');
    ribGrad.addColorStop(0.8, '#383838');
    ribGrad.addColorStop(1, '#383838');
    rbCtx.fillStyle = ribGrad;
    rbCtx.fillRect(x, 0, 8, 128);
  }
  rbCtx.fillStyle = '#e5e5e5';
  rbCtx.fillRect(0, 0, 128, 8);
  rbCtx.fillRect(0, 120, 128, 8);

  const containerRibBump = toCanvasTexture(rbSurface.canvas);
  containerRibBump.wrapS = THREE.RepeatWrapping;
  containerRibBump.wrapT = THREE.RepeatWrapping;
  containerRibBump.repeat.set(2, 1);

  const rrSurface = makeProceduralCanvas(128, 128);
  const rrCtx = rrSurface.ctx;
  rrCtx.fillStyle = '#9e9e9e';
  rrCtx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    rrCtx.fillStyle = '#7c7c7c';
    rrCtx.fillRect(x + 2, 0, 3, 128);
    rrCtx.fillStyle = '#c4c4c4';
    rrCtx.fillRect(x + 6, 0, 2, 128);
  }
  const containerRibRoughness = toCanvasTexture(rrSurface.canvas);
  containerRibRoughness.wrapS = THREE.RepeatWrapping;
  containerRibRoughness.wrapT = THREE.RepeatWrapping;
  containerRibRoughness.repeat.set(2, 1);

  // 6. Architectural Mullioned Glass Curtain Wall Texture
  const gSurface = makeProceduralCanvas(512, 256);
  const gCtx = gSurface.ctx;
  const skyGrad = gCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#102840');
  skyGrad.addColorStop(0.45, '#1d3b5c');
  skyGrad.addColorStop(1, '#0b1829');
  gCtx.fillStyle = skyGrad;
  gCtx.fillRect(0, 0, 512, 256);

  for (let col = 0; col < 8; col += 1) {
    for (let row = 0; row < 2; row += 1) {
      const wx = col * 64 + 6;
      const wy = row * 128 + 10;
      const lit = (col + row * 3) % 3 !== 0;
      if (lit) {
        const wg = gCtx.createLinearGradient(wx, wy, wx, wy + 108);
        wg.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
        wg.addColorStop(0.55, 'rgba(254, 240, 199, 0.36)');
        wg.addColorStop(1, 'rgba(14, 165, 233, 0.16)');
        gCtx.fillStyle = wg;
        gCtx.fillRect(wx, wy, 52, 108);
      }
    }
  }
  gCtx.fillStyle = '#0f172a';
  for (let x = 0; x <= 512; x += 64) {
    gCtx.fillRect(x - 3, 0, 6, 256);
  }
  gCtx.fillRect(0, 122, 512, 12);
  gCtx.fillRect(0, 0, 512, 8);
  gCtx.fillRect(0, 248, 512, 8);

  const curtainWall = toCanvasTexture(gSurface.canvas);
  curtainWall.colorSpace = THREE.SRGBColorSpace;
  curtainWall.anisotropy = anisotropy;

  // 7. Goliath Crane Girder Banners — "SEASTAR HEAVY" (Requirement #13)
  const makeCraneBanner = (bg: string, text: string, sub: string) => {
    const surface = makeProceduralCanvas(1024, 160);
    const ctx = surface.ctx;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 4;
    for (let x = 0; x <= 1024; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 160);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 0, 1024, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(0, 140, 1024, 20);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 66);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText(sub, 512, 122);

    const tex = toCanvasTexture(surface.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  };

  const craneBannerOrange = makeCraneBanner('#b4481c', 'SEASTAR HEAVY', 'DOCK-01 · OUTFITTING QUAY');
  const craneBannerBlue = makeCraneBanner('#144e78', 'SEASTAR HEAVY', 'DOCK-02 · FLOATING DOCK FD-01');

  // 8. Generic Welded Hull Steel Plates & Draft Marks
  const hmSurface = makeProceduralCanvas(1024, 256);
  const hmCtx = hmSurface.ctx;
  hmCtx.fillStyle = '#183049';
  hmCtx.fillRect(0, 0, 1024, 178);
  hmCtx.fillStyle = '#8b2525';
  hmCtx.fillRect(0, 178, 1024, 78);
  hmCtx.fillStyle = '#e2e8f0';
  hmCtx.fillRect(0, 172, 1024, 7);
  hmCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  hmCtx.lineWidth = 2;
  for (let x = 0; x < 1024; x += 64) {
    hmCtx.beginPath();
    hmCtx.moveTo(x, 0);
    hmCtx.lineTo(x, 256);
    hmCtx.stroke();
  }
  const hullSteelPlates = toCanvasTexture(hmSurface.canvas);
  hullSteelPlates.colorSpace = THREE.SRGBColorSpace;
  hullSteelPlates.anisotropy = anisotropy;

  // 9. Procedural Water Normal Map (zero external CDN)
  const waterNormRes = buildProceduralWaterNormalTexture(anisotropy);
  usedOffscreenCanvas = usedOffscreenCanvas || waterNormRes.isOffscreen;
  const waterNormals = waterNormRes.tex;

  // 10. Soft Contact Shadow Disc
  const sSurface = makeProceduralCanvas(128, 128);
  const sCtx = sSurface.ctx;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(4, 15, 30, 0.56)');
  grad.addColorStop(0.65, 'rgba(4, 15, 30, 0.2)');
  grad.addColorStop(1, 'rgba(4, 15, 30, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = toCanvasTexture(sSurface.canvas);

  // 11. Soft Volumetric Cloud Puff Sprite Texture
  const clSurface = makeProceduralCanvas(256, 128);
  const clCtx = clSurface.ctx;
  const puffs = [
    { x: 90, y: 74, r: 44 },
    { x: 132, y: 58, r: 52 },
    { x: 174, y: 72, r: 42 },
    { x: 128, y: 84, r: 46 },
  ];
  for (const p of puffs) {
    const cg = clCtx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
    cg.addColorStop(0, 'rgba(255, 252, 246, 0.72)');
    cg.addColorStop(0.6, 'rgba(241, 245, 249, 0.35)');
    cg.addColorStop(1, 'rgba(241, 245, 249, 0)');
    clCtx.fillStyle = cg;
    clCtx.fillRect(0, 0, 256, 128);
  }
  const cloudPuff = toCanvasTexture(clSurface.canvas);
  cloudPuff.colorSpace = THREE.SRGBColorSpace;

  // 12. Illuminated Architectural Rooftop Signboard Factory
  const createSignboard = (title: string, subtitle: string, accentHex: string): THREE.CanvasTexture => {
    const surface = makeProceduralCanvas(512, 128);
    const ctx = surface.ctx;
    ctx.fillStyle = '#0b1322';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 16, 128);
    ctx.fillRect(0, 118, 512, 10);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 124);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 34, 52);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(subtitle, 34, 96);

    const tex = toCanvasTexture(surface.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    dynamicTextures.push(tex);
    return tex;
  };

  // 12b. Stage 8 Hub Module Building Signboard ("준비 중" construction board vs illuminated operational fascia)
  const createHubBuildingSignboard = (
    title: string,
    statusBanner: string,
    accentHex: string,
    isPlanned: boolean,
  ): THREE.CanvasTexture => {
    const surface = makeProceduralCanvas(512, 160);
    const ctx = surface.ctx;

    if (isPlanned) {
      // High-contrast construction hazard frame + bold "준비 중" banner
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 512, 160);

      // Top yellow/black diagonal hazard stripe header
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, 512, 26);
      ctx.fillStyle = '#0f172a';
      for (let x = -32; x < 544; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 26);
        ctx.lineTo(x + 16, 26);
        ctx.lineTo(x + 30, 0);
        ctx.lineTo(x + 14, 0);
        ctx.closePath();
        ctx.fill();
      }

      // Bottom hazard border
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 146, 512, 14);

      // Module title
      ctx.fillStyle = '#f8fafc';
      ctx.font = '800 38px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(title.slice(0, 16), 24, 72);

      // Prominent "준비 중" badge pill
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(24, 102, 148, 34);
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(statusBanner || '준비 중', 98, 120);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('공사 중 · 연동 예정', 186, 120);
    } else {
      ctx.fillStyle = '#0b1322';
      ctx.fillRect(0, 0, 512, 160);
      ctx.fillStyle = accentHex;
      ctx.fillRect(0, 0, 18, 160);
      ctx.fillRect(0, 148, 512, 12);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 508, 156);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '800 40px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(title.slice(0, 16), 34, 62);

      // Status pill bar
      ctx.fillStyle = accentHex;
      ctx.fillRect(34, 98, 134, 34);
      ctx.fillStyle = '#0b1322';
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(statusBanner, 101, 116);
    }

    const tex = toCanvasTexture(surface.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  };

  // 13. Minimal Circular Billboard Icon for Distant Avatar LOD (zero clutter)
  const createAvatarBillboardIcon = (
    accentHex: string,
    online: boolean,
    isCurrentUser: boolean,
  ): THREE.CanvasTexture => {
    const key = `${accentHex}_${online ? 1 : 0}_${isCurrentUser ? 1 : 0}`;
    const cached = billboardIconCache.get(key);
    if (cached) return cached;

    const surface = makeProceduralCanvas(64, 64);
    const ctx = surface.ctx;
    ctx.clearRect(0, 0, 64, 64);

    // Subtle dark circular backdrop
    ctx.beginPath();
    ctx.arc(32, 32, 24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = isCurrentUser ? '#38bdf8' : online ? '#34d399' : '#94a3b8';
    ctx.stroke();

    // Minimal crisp person silhouette icon
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(32, 23, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(32, 46, 13, Math.PI * 1.12, Math.PI * 1.88);
    ctx.fill();

    // Small accent collar dot
    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.arc(32, 35, 3, 0, Math.PI * 2);
    ctx.fill();

    const tex = toCanvasTexture(surface.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    billboardIconCache.set(key, tex);
    dynamicTextures.push(tex);
    return tex;
  };

  return {
    concreteAlbedo,
    concreteBump,
    concreteRoughness,
    asphaltRoad,
    hazardTrim,
    containerRib: containerRibBump,
    containerRibBump,
    containerRibRoughness,
    curtainWall,
    contactShadow,
    craneBannerOrange,
    craneBannerBlue,
    hullSteelPlates,
    waterNormals,
    cloudPuff,
    usedOffscreenCanvas,
    createSignboard,
    createHubBuildingSignboard,
    createAvatarBillboardIcon,
    dispose: () => {
      concreteAlbedo.dispose();
      concreteBump.dispose();
      concreteRoughness.dispose();
      asphaltRoad.dispose();
      hazardTrim.dispose();
      containerRibBump.dispose();
      containerRibRoughness.dispose();
      curtainWall.dispose();
      contactShadow.dispose();
      craneBannerOrange.dispose();
      craneBannerBlue.dispose();
      hullSteelPlates.dispose();
      waterNormals.dispose();
      cloudPuff.dispose();
      dynamicTextures.forEach((t) => t.dispose());
    },
  };
}
