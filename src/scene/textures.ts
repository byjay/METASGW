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
  cloudPuff: THREE.CanvasTexture;
  usedOffscreenCanvas: boolean;
  createSignboard: (title: string, subtitle: string, accentHex: string) => THREE.CanvasTexture;
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
 * Generates all 3D PBR textures procedurally via OffscreenCanvas (zero external CDN calls).
 */
export function createHarborTextures(maxAnisotropy: number): HarborTexturePack {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
  const dynamicTextures: THREE.CanvasTexture[] = [];
  let usedOffscreenCanvas = false;

  let seed = 4201;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // 1. Quay Heavy Concrete Albedo (expansion joints + salt/oil weathering + aggregate grain)
  const cSurface = makeProceduralCanvas(512, 512);
  usedOffscreenCanvas = usedOffscreenCanvas || cSurface.isOffscreen;
  const cCtx = cSurface.ctx;

  cCtx.fillStyle = '#8b96a3';
  cCtx.fillRect(0, 0, 512, 512);

  // Subtle slab-by-slab weathering tone variation
  for (let sy = 0; sy < 4; sy += 1) {
    for (let sx = 0; sx < 4; sx += 1) {
      const toneDelta = Math.floor((rand() - 0.5) * 14);
      const base = 136 + toneDelta;
      cCtx.fillStyle = `rgb(${base}, ${base + 7}, ${base + 15})`;
      cCtx.fillRect(sx * 128 + 2, sy * 128 + 2, 124, 124);
    }
  }

  // Expansion joints (줄눈)
  cCtx.strokeStyle = 'rgba(20, 29, 44, 0.56)';
  cCtx.lineWidth = 3;
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

  // Oil / salt-spray / rain-runoff weathering stains
  for (let i = 0; i < 72; i += 1) {
    const rx = rand() * 512;
    const ry = rand() * 512;
    const rad = 16 + rand() * 44;
    const g = cCtx.createRadialGradient(rx, ry, 2, rx, ry, rad);
    const kind = rand();
    if (kind < 0.45) {
      g.addColorStop(0, 'rgba(30, 41, 59, 0.17)');
    } else if (kind < 0.7) {
      g.addColorStop(0, 'rgba(120, 72, 36, 0.11)');
    } else {
      g.addColorStop(0, 'rgba(218, 226, 236, 0.14)');
    }
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cCtx.fillStyle = g;
    cCtx.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
  }

  // Fine aggregate micro-pitting
  for (let i = 0; i < 4600; i += 1) {
    const shade = Math.floor(94 + rand() * 76);
    cCtx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 9}, 0.28)`;
    cCtx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }

  // Faded painted quay lane dashes
  cCtx.fillStyle = 'rgba(234, 179, 8, 0.52)';
  cCtx.fillRect(0, 446, 512, 7);
  cCtx.fillStyle = 'rgba(226, 232, 240, 0.42)';
  for (let x = 0; x < 512; x += 64) {
    cCtx.fillRect(x + 8, 250, 32, 5);
  }

  const concreteAlbedo = toCanvasTexture(cSurface.canvas);
  concreteAlbedo.colorSpace = THREE.SRGBColorSpace;
  concreteAlbedo.wrapS = THREE.RepeatWrapping;
  concreteAlbedo.wrapT = THREE.RepeatWrapping;
  concreteAlbedo.repeat.set(9, 2.2);
  concreteAlbedo.anisotropy = anisotropy;

  // 2. Concrete Bump Map (Linear) + Roughness Map (Linear)
  const bSurface = makeProceduralCanvas(256, 256);
  const bCtx = bSurface.ctx;
  bCtx.fillStyle = '#848484';
  bCtx.fillRect(0, 0, 256, 256);
  bCtx.strokeStyle = '#222222';
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
  for (let i = 0; i < 2400; i += 1) {
    const v = Math.floor(86 + rand() * 88);
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  const concreteBump = toCanvasTexture(bSurface.canvas);
  concreteBump.wrapS = THREE.RepeatWrapping;
  concreteBump.wrapT = THREE.RepeatWrapping;
  concreteBump.repeat.set(9, 2.2);

  const crSurface = makeProceduralCanvas(256, 256);
  const crCtx = crSurface.ctx;
  // Base high-roughness concrete (215/255 ~ 0.84) with smoother damp/oil patches & rougher joints
  crCtx.fillStyle = '#d4d4d4';
  crCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 38; i += 1) {
    const rx = rand() * 256;
    const ry = rand() * 256;
    const rad = 10 + rand() * 26;
    const g = crCtx.createRadialGradient(rx, ry, 1, rx, ry, rad);
    g.addColorStop(0, 'rgba(135, 135, 135, 0.55)');
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
  for (let i = 0; i < 2800; i += 1) {
    const v = Math.floor(35 + rand() * 44);
    aCtx.fillStyle = `rgba(${v},${v + 5},${v + 12},0.4)`;
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
  hCtx.fillStyle = '#f59e0b';
  hCtx.fillRect(0, 0, 256, 64);
  hCtx.fillStyle = '#0f172a';
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

  // 5. Corrugated Container Steel Bump + Roughness (Linear PBR pair)
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
  // Horizontal corner-post frames
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
    // Valleys collect dust/salt (rougher), crests wear slightly shinier
    rrCtx.fillStyle = '#7c7c7c';
    rrCtx.fillRect(x + 2, 0, 3, 128);
    rrCtx.fillStyle = '#c4c4c4';
    rrCtx.fillRect(x + 6, 0, 2, 128);
  }
  for (let i = 0; i < 400; i += 1) {
    const v = Math.floor(110 + rand() * 85);
    rrCtx.fillStyle = `rgba(${v},${v},${v},0.32)`;
    rrCtx.fillRect(rand() * 128, rand() * 128, 3, 3);
  }
  const containerRibRoughness = toCanvasTexture(rrSurface.canvas);
  containerRibRoughness.wrapS = THREE.RepeatWrapping;
  containerRibRoughness.wrapT = THREE.RepeatWrapping;
  containerRibRoughness.repeat.set(2, 1);

  // 6. Architectural Mullioned Glass Curtain Wall Texture
  const gSurface = makeProceduralCanvas(512, 256);
  const gCtx = gSurface.ctx;
  const skyGrad = gCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#0f2942');
  skyGrad.addColorStop(0.45, '#1e3a5f');
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

  // 7. Generic Goliath Crane Girder Banners (Strictly DOCK-01 / DOCK-02 sample format)
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
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 140, 1024, 20);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 68);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText(sub, 512, 120);

    const tex = toCanvasTexture(surface.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  };

  const craneBannerOrange = makeCraneBanner('#c2410c', 'SGW HARBOR · DOCK-01', 'GANTRY CRANE 01');
  const craneBannerBlue = makeCraneBanner('#0369a1', 'SGW HARBOR · DOCK-02', 'GANTRY CRANE 02');

  // 8. Generic Welded Hull Steel Plates & Draft Marks (Zero real hull numbers)
  const hmSurface = makeProceduralCanvas(1024, 256);
  const hmCtx = hmSurface.ctx;
  hmCtx.fillStyle = '#0f233c';
  hmCtx.fillRect(0, 0, 1024, 178);
  hmCtx.fillStyle = '#991b1b';
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
  hmCtx.fillStyle = '#e2e8f0';
  hmCtx.font = '700 16px ui-monospace, monospace';
  for (let i = 0; i < 6; i += 1) {
    hmCtx.fillText(`${12 - i * 2}M`, 76, 118 + i * 20);
    hmCtx.fillText(`${12 - i * 2}M`, 920, 118 + i * 20);
  }
  const hullSteelPlates = toCanvasTexture(hmSurface.canvas);
  hullSteelPlates.colorSpace = THREE.SRGBColorSpace;
  hullSteelPlates.anisotropy = anisotropy;

  // 9. Soft Contact Shadow Disc
  const sSurface = makeProceduralCanvas(128, 128);
  const sCtx = sSurface.ctx;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(4, 15, 30, 0.56)');
  grad.addColorStop(0.65, 'rgba(4, 15, 30, 0.2)');
  grad.addColorStop(1, 'rgba(4, 15, 30, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = toCanvasTexture(sSurface.canvas);

  // 10. Soft Volumetric Cloud Puff Sprite Texture
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

  // 11. Illuminated Architectural Rooftop Signboard Factory
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
    cloudPuff,
    usedOffscreenCanvas,
    createSignboard,
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
      cloudPuff.dispose();
      dynamicTextures.forEach((t) => t.dispose());
    },
  };
}
