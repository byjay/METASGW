import * as THREE from 'three';

export interface HarborTexturePack {
  concreteAlbedo: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  oceanBump: THREE.CanvasTexture;
  asphaltRoad: THREE.CanvasTexture;
  hazardTrim: THREE.CanvasTexture;
  containerRib: THREE.CanvasTexture;
  curtainWall: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  craneBannerOrange: THREE.CanvasTexture;
  craneBannerBlue: THREE.CanvasTexture;
  hullDraftMarks: THREE.CanvasTexture;
  cloudPuff: THREE.CanvasTexture;
  createSignboard: (title: string, subtitle: string, accentHex: string) => THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createHarborTextures(maxAnisotropy: number): HarborTexturePack {
  const anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
  const dynamicTextures: THREE.CanvasTexture[] = [];

  // Deterministic PRNG
  let seed = 1042;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // 1. Weathered Heavy Shipyard Concrete Albedo (with crane rails, joints & tire/salt stains)
  const [cCanvas, cCtx] = makeCanvas(512, 512);
  cCtx.fillStyle = '#7e8a97';
  cCtx.fillRect(0, 0, 512, 512);

  // Concrete slab expansion joints
  cCtx.strokeStyle = 'rgba(22, 31, 46, 0.42)';
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

  // Subtle industrial weathering blotches & salt grit
  for (let i = 0; i < 60; i++) {
    const rx = rand() * 512;
    const ry = rand() * 512;
    const rad = 18 + rand() * 42;
    const g = cCtx.createRadialGradient(rx, ry, 2, rx, ry, rad);
    const dark = rand() > 0.5;
    g.addColorStop(0, dark ? 'rgba(30, 41, 59, 0.14)' : 'rgba(203, 213, 225, 0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cCtx.fillStyle = g;
    cCtx.fillRect(rx - rad, ry - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 5400; i++) {
    const shade = Math.floor(92 + rand() * 74);
    cCtx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 9}, 0.28)`;
    cCtx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }

  // Painted yellow shipyard safety lane line
  cCtx.fillStyle = 'rgba(234, 179, 8, 0.55)';
  cCtx.fillRect(0, 446, 512, 8);
  cCtx.fillStyle = 'rgba(226, 232, 240, 0.45)';
  for (let x = 0; x < 512; x += 64) {
    cCtx.fillRect(x + 8, 250, 32, 5);
  }

  const concreteAlbedo = new THREE.CanvasTexture(cCanvas);
  concreteAlbedo.colorSpace = THREE.SRGBColorSpace;
  concreteAlbedo.wrapS = THREE.RepeatWrapping;
  concreteAlbedo.wrapT = THREE.RepeatWrapping;
  concreteAlbedo.repeat.set(9, 2.2);
  concreteAlbedo.anisotropy = anisotropy;

  // 2. Concrete Bump Map
  const [bCanvas, bCtx] = makeCanvas(256, 256);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);
  bCtx.strokeStyle = '#303030';
  bCtx.lineWidth = 2;
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
  for (let i = 0; i < 2400; i++) {
    const v = Math.floor(88 + rand() * 80);
    bCtx.fillStyle = `rgb(${v},${v},${v})`;
    bCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  const concreteBump = new THREE.CanvasTexture(bCanvas);
  concreteBump.wrapS = THREE.RepeatWrapping;
  concreteBump.wrapT = THREE.RepeatWrapping;
  concreteBump.repeat.set(9, 2.2);

  // 2b. Procedural Ocean Swell Bump Texture (kept for backward compatibility with HarborScene)
  const [wCanvas, wCtx] = makeCanvas(128, 128);
  const wImg = wCtx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const nx = (x / 128) * Math.PI * 2;
      const ny = (y / 128) * Math.PI * 2;
      const val = Math.sin(nx * 3 + ny * 2) * 0.45 + Math.cos(nx * 5 - ny * 4) * 0.35;
      const lum = Math.max(0, Math.min(255, Math.round(128 + val * 92)));
      const idx = (y * 128 + x) * 4;
      wImg.data[idx] = lum;
      wImg.data[idx + 1] = lum;
      wImg.data[idx + 2] = lum;
      wImg.data[idx + 3] = 255;
    }
  }
  wCtx.putImageData(wImg, 0, 0);
  const oceanBump = new THREE.CanvasTexture(wCanvas);
  oceanBump.wrapS = THREE.RepeatWrapping;
  oceanBump.wrapT = THREE.RepeatWrapping;
  oceanBump.repeat.set(22, 22);

  // 3. Dark Shipyard Asphalt / Staging Apron
  const [aCanvas, aCtx] = makeCanvas(256, 256);
  aCtx.fillStyle = '#334155';
  aCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const v = Math.floor(35 + rand() * 44);
    aCtx.fillStyle = `rgba(${v},${v + 5},${v + 12},0.4)`;
    aCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }
  const asphaltRoad = new THREE.CanvasTexture(aCanvas);
  asphaltRoad.colorSpace = THREE.SRGBColorSpace;
  asphaltRoad.wrapS = THREE.RepeatWrapping;
  asphaltRoad.wrapT = THREE.RepeatWrapping;
  asphaltRoad.repeat.set(10, 3);
  asphaltRoad.anisotropy = anisotropy;

  // 4. Maritime Safety Quay Trim (Yellow & Charcoal Chevron)
  const [hCanvas, hCtx] = makeCanvas(256, 64);
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
  const hazardTrim = new THREE.CanvasTexture(hCanvas);
  hazardTrim.colorSpace = THREE.SRGBColorSpace;
  hazardTrim.wrapS = THREE.RepeatWrapping;
  hazardTrim.wrapT = THREE.RepeatWrapping;
  hazardTrim.repeat.set(20, 1);
  hazardTrim.anisotropy = anisotropy;

  // 5. Corrugated Container Steel Rib Bump/Albedo
  const [rCanvas, rCtx] = makeCanvas(128, 128);
  rCtx.fillStyle = '#909090';
  rCtx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    rCtx.fillStyle = '#d4d4d4';
    rCtx.fillRect(x, 0, 4, 128);
    rCtx.fillStyle = '#484848';
    rCtx.fillRect(x + 4, 0, 4, 128);
  }
  const containerRib = new THREE.CanvasTexture(rCanvas);
  containerRib.wrapS = THREE.RepeatWrapping;
  containerRib.wrapT = THREE.RepeatWrapping;
  containerRib.repeat.set(2, 1);

  // 6. Architectural Mullioned Glass Curtain Wall Texture (Lit Interior Engineering Offices)
  const [gCanvas, gCtx] = makeCanvas(512, 256);
  const skyGrad = gCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#0f2942');
  skyGrad.addColorStop(0.45, '#1e3a5f');
  skyGrad.addColorStop(1, '#0b1829');
  gCtx.fillStyle = skyGrad;
  gCtx.fillRect(0, 0, 512, 256);

  // Warm interior studio glow panels & CAD monitors inside windows
  for (let col = 0; col < 8; col++) {
    for (let row = 0; row < 2; row++) {
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
      // Subtle diagonal glass reflection sheen
      gCtx.fillStyle = 'rgba(186, 230, 253, 0.10)';
      gCtx.beginPath();
      gCtx.moveTo(wx, wy);
      gCtx.lineTo(wx + 24, wy);
      gCtx.lineTo(wx, wy + 52);
      gCtx.closePath();
      gCtx.fill();
    }
  }
  // Crisp dark anodized aluminum mullions
  gCtx.fillStyle = '#0f172a';
  for (let x = 0; x <= 512; x += 64) {
    gCtx.fillRect(x - 3, 0, 6, 256);
  }
  gCtx.fillRect(0, 122, 512, 12);
  gCtx.fillRect(0, 0, 512, 8);
  gCtx.fillRect(0, 248, 512, 8);

  const curtainWall = new THREE.CanvasTexture(gCanvas);
  curtainWall.colorSpace = THREE.SRGBColorSpace;
  curtainWall.anisotropy = anisotropy;

  // 7. Goliath Crane Girder Typography Banners
  const makeCraneBanner = (bg: string, text: string, sub: string) => {
    const [cv, ctx] = makeCanvas(1024, 160);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 160);
    // Steel panel seams & rivets
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
    ctx.font = '900 58px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 68);
    ctx.fillStyle = '#fde68a';
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillText(sub, 512, 120);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  };

  const craneBannerOrange = makeCraneBanner('#c2410c', 'SEASTAR HEAVY · 900T', 'META-SGW GOLIATH DOCK NO.1');
  const craneBannerBlue = makeCraneBanner('#0369a1', 'H1042 LNG · 174K', 'SMART SHIPYARD DIGITAL TWIN');

  // 8. LNG Carrier Hull Nameplate & Plimsoll Draft Marks
  const [hmCanvas, hmCtx] = makeCanvas(1024, 256);
  hmCtx.fillStyle = '#0f233c';
  hmCtx.fillRect(0, 0, 1024, 178);
  hmCtx.fillStyle = '#991b1b';
  hmCtx.fillRect(0, 178, 1024, 78);
  // White boot-top waterline stripe
  hmCtx.fillStyle = '#e2e8f0';
  hmCtx.fillRect(0, 172, 1024, 7);
  // Welded steel hull plate seams
  hmCtx.strokeStyle = 'rgba(255,255,255,0.06)';
  hmCtx.lineWidth = 2;
  for (let x = 0; x < 1024; x += 64) {
    hmCtx.beginPath();
    hmCtx.moveTo(x, 0);
    hmCtx.lineTo(x, 256);
    hmCtx.stroke();
  }
  hmCtx.fillStyle = '#f8fafc';
  hmCtx.font = '800 52px "Plus Jakarta Sans", sans-serif';
  hmCtx.textAlign = 'center';
  hmCtx.fillText('SEASTAR H1042  ·  LNG CARRIER', 512, 108);
  hmCtx.font = '700 20px "JetBrains Mono", monospace';
  hmCtx.fillStyle = '#cbd5e1';
  hmCtx.fillText('IMO 9981042   ·   174,000 m³   ·   NO SMOKING · SAFETY FIRST', 512, 148);
  // Draft marks near bow/stern
  hmCtx.fillStyle = '#f8fafc';
  hmCtx.font = '700 16px monospace';
  for (let i = 0; i < 6; i++) {
    hmCtx.fillText(`${12 - i * 2}M`, 92, 118 + i * 20);
    hmCtx.fillText(`${12 - i * 2}M`, 932, 118 + i * 20);
  }
  const hullDraftMarks = new THREE.CanvasTexture(hmCanvas);
  hullDraftMarks.colorSpace = THREE.SRGBColorSpace;
  hullDraftMarks.anisotropy = anisotropy;

  // 9. Soft Contact Shadow Disc
  const [sCanvas, sCtx] = makeCanvas(128, 128);
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(4, 15, 30, 0.58)');
  grad.addColorStop(0.65, 'rgba(4, 15, 30, 0.22)');
  grad.addColorStop(1, 'rgba(4, 15, 30, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(sCanvas);

  // 10. Soft Volumetric Cloud Puff Sprite Texture
  const [clCanvas, clCtx] = makeCanvas(256, 128);
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
  const cloudPuff = new THREE.CanvasTexture(clCanvas);
  cloudPuff.colorSpace = THREE.SRGBColorSpace;

  // 11. Illuminated Industrial Architectural Rooftop Signboard Factory
  const createSignboard = (title: string, subtitle: string, accentHex: string): THREE.CanvasTexture => {
    const [cv, ctx] = makeCanvas(512, 128);
    ctx.fillStyle = '#0b1322';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, 0, 16, 128);
    ctx.fillRect(0, 118, 512, 10);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 124);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 44px "Plus Jakarta Sans", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 34, 52);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 22px "Noto Sans KR", sans-serif';
    ctx.fillText(subtitle, 34, 96);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    dynamicTextures.push(tex);
    return tex;
  };

  return {
    concreteAlbedo,
    concreteBump,
    oceanBump,
    asphaltRoad,
    hazardTrim,
    containerRib,
    curtainWall,
    contactShadow,
    craneBannerOrange,
    craneBannerBlue,
    hullDraftMarks,
    cloudPuff,
    createSignboard,
    dispose: () => {
      concreteAlbedo.dispose();
      concreteBump.dispose();
      oceanBump.dispose();
      asphaltRoad.dispose();
      hazardTrim.dispose();
      containerRib.dispose();
      curtainWall.dispose();
      contactShadow.dispose();
      craneBannerOrange.dispose();
      craneBannerBlue.dispose();
      hullDraftMarks.dispose();
      cloudPuff.dispose();
      dynamicTextures.forEach((t) => t.dispose());
    },
  };
}
