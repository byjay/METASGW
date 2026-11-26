import {
  ALL_POINT_CLOUD_FORMATS,
  ENGINEERING_MODULES,
  type ActorRoleType,
  type EngineeringModuleConfig,
  type PointCloudFormat,
  type ShipId,
} from '../config/fleetConfig';

export interface Vec2 {
  x: number;
  z: number;
}

export interface SpatialAgent {
  id: string;
  shipId: ShipId;
  name: string;
  actorRole: ActorRoleType;
  position: Vec2;
  velocity: Vec2;
}

export interface ProximityState {
  mode: 'idle' | 'bubble' | 'conference' | 'silent';
  peers: Array<{ id: string; name: string; distance: number; actorRole: ActorRoleType }>;
  activeZone: EngineeringModuleConfig | null;
  livekitRoomKey: string | null;
  audioMutedBySilentZone: boolean;
}

export interface RTCNetworkStatus {
  stunPort: number;
  turnPort: number;
  transport: 'udp' | 'tcp';
  masqueradeMode: 'DIRECT' | 'HTTPS';
  udpBlocked: boolean;
  failoverMs: number;
  connectionState: 'connected' | 'relayed_tcp_443';
}

export interface FaroViewerResolution {
  engine: 'FARO WebShare' | 'ViewerFX';
  allowedFormats: PointCloudFormat[];
  formatSupported: boolean;
  readOnly: boolean;
  watermarkText: string | null;
  targetUrl: string;
}

/**
 * Role 1: Colyseus DHT AoI Spatial Index & Velocity Interest Predictor
 */
export class HarborDHTNode {
  private agents = new Map<string, SpatialAgent>();

  public upsertAgent(agent: SpatialAgent): void {
    this.agents.set(agent.id, agent);
  }

  public getLocation(objectId: string): Vec2 | null {
    const found = this.agents.get(objectId);
    return found ? { ...found.position } : null;
  }

  public getInterest(agentId: string, rangeRadius: number): SpatialAgent[] {
    const origin = this.agents.get(agentId);
    if (!origin) return [];
    const rSq = rangeRadius * rangeRadius;
    const result: SpatialAgent[] = [];
    for (const candidate of this.agents.values()) {
      if (candidate.id === agentId) continue;
      const dx = candidate.position.x - origin.position.x;
      const dz = candidate.position.z - origin.position.z;
      if (dx * dx + dz * dz <= rSq) {
        result.push(candidate);
      }
    }
    return result;
  }

  public predictNextInterestZone(
    agentId: string,
    velocityVector: Vec2,
    lookAheadSeconds = 2.0,
  ): { predictedPos: Vec2; nearestModule: EngineeringModuleConfig | null; distance: number } {
    const current = this.agents.get(agentId)?.position ?? { x: 0, z: 0 };
    const predictedPos = {
      x: current.x + velocityVector.x * lookAheadSeconds,
      z: current.z + velocityVector.z * lookAheadSeconds,
    };

    let nearestModule: EngineeringModuleConfig | null = null;
    let bestDist = Infinity;

    for (const mod of ENGINEERING_MODULES) {
      const dBerth = Math.hypot(predictedPos.x - mod.berthPos.x, predictedPos.z - mod.berthPos.z);
      const dDock = Math.hypot(predictedPos.x - mod.dockPos.x, predictedPos.z - mod.dockPos.z);
      const d = Math.min(dBerth, dDock);
      if (d < bestDist) {
        bestDist = d;
        nearestModule = mod;
      }
    }

    return {
      predictedPos,
      nearestModule: bestDist <= 16 ? nearestModule : null,
      distance: Number.isFinite(bestDist) ? Math.round(bestDist * 10) / 10 : 0,
    };
  }
}

/**
 * Role 5: Spatial Proximity Calculator, Video Bubble (max 4 peers), and Silent Focus Zone enforcement.
 * Checks BOTH walk-in building interiors (dockPos) and harbor water berths (berthPos).
 */
export function evaluateProximityState(params: {
  playerPos: Vec2;
  otherAgents: SpatialAgent[];
  tenantId: string;
  projectId: string;
  bubbleRadius?: number;
  zoneRadius?: number;
}): ProximityState {
  const bubbleRadius = params.bubbleRadius ?? 13.0;
  const zoneRadius = params.zoneRadius ?? 8.2;

  let activeZone: EngineeringModuleConfig | null = null;
  let closestZoneDist = Infinity;
  for (const mod of ENGINEERING_MODULES) {
    const dBerth = Math.hypot(params.playerPos.x - mod.berthPos.x, params.playerPos.z - mod.berthPos.z);
    const dDock = Math.hypot(params.playerPos.x - mod.dockPos.x, params.playerPos.z - mod.dockPos.z);
    const d = Math.min(dBerth, dDock);
    if (d <= zoneRadius && d < closestZoneDist) {
      closestZoneDist = d;
      activeZone = mod;
    }
  }

  // Silent Focus Zone (e.g., zone_pdf_reading) immediately mutes & destroys media streams
  if (activeZone && activeZone.silent) {
    return {
      mode: 'silent',
      peers: [],
      activeZone,
      livekitRoomKey: null,
      audioMutedBySilentZone: true,
    };
  }

  const nearbyPeers = params.otherAgents
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      actorRole: agent.actorRole,
      distance: Math.round(Math.hypot(agent.position.x - params.playerPos.x, agent.position.z - params.playerPos.z) * 10) / 10,
    }))
    .filter((p) => p.distance <= bubbleRadius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4); // Maximum 4 peers in proximity video bubble

  if (activeZone && activeZone.zoneType === 'conference') {
    return {
      mode: 'conference',
      peers: nearbyPeers,
      activeZone,
      livekitRoomKey: `lk-${params.tenantId}-${params.projectId}-${activeZone.zoneId}`,
      audioMutedBySilentZone: false,
    };
  }

  if (nearbyPeers.length > 0) {
    return {
      mode: 'bubble',
      peers: nearbyPeers,
      activeZone,
      livekitRoomKey: `lk-${params.tenantId}-${params.projectId}-bubble-${nearbyPeers[0].id}`,
      audioMutedBySilentZone: false,
    };
  }

  return {
    mode: 'idle',
    peers: [],
    activeZone,
    livekitRoomKey: null,
    audioMutedBySilentZone: false,
  };
}

/**
 * Role 5: WebRTC STUN UDP 12547 -> TURN TCP 443 HTTPS Masquerade Fallback resolver
 */
export function resolveRtcNetworkState(udpBlocked: boolean): RTCNetworkStatus {
  if (udpBlocked) {
    return {
      stunPort: 12547,
      turnPort: 443,
      transport: 'tcp',
      masqueradeMode: 'HTTPS',
      udpBlocked: true,
      failoverMs: 680,
      connectionState: 'relayed_tcp_443',
    };
  }
  return {
    stunPort: 12547,
    turnPort: 443,
    transport: 'udp',
    masqueradeMode: 'DIRECT',
    udpBlocked: false,
    failoverMs: 42,
    connectionState: 'connected',
  };
}

/**
 * Role 4: FARO 360 (HQ Employee) vs ViewerFX (External Partner) auto-branching
 */
export function resolveFaroViewerMode(
  actorRole: ActorRoleType,
  requestedFormat: PointCloudFormat,
  projectId: string,
): FaroViewerResolution {
  if (actorRole === 'partner') {
    const allowed: PointCloudFormat[] = ['.e57', '.las', '.laz'];
    return {
      engine: 'ViewerFX',
      allowedFormats: allowed,
      formatSupported: allowed.includes(requestedFormat),
      readOnly: true,
      watermarkText: `PARTNER READ-ONLY · ${projectId} · viewerfx.seastar.work`,
      targetUrl: `https://viewerfx.seastar.work/view?project=${projectId}&fmt=${requestedFormat.slice(1)}`,
    };
  }

  return {
    engine: 'FARO WebShare',
    allowedFormats: ALL_POINT_CLOUD_FORMATS,
    formatSupported: ALL_POINT_CLOUD_FORMATS.includes(requestedFormat),
    readOnly: false,
    watermarkText: null,
    targetUrl: `https://sgw.seastar.work/faro-webshare/${projectId}?fmt=${requestedFormat.slice(1)}`,
  };
}

/**
 * Role 3: Harbor navigable water bounds & pier collision clamping for the 2X Expanded Harbor Basin
 * Keeps ships inside the sheltered harbor basin and outside North quay, West bmail pier, and East 174K LNG Carrier dock.
 */
export function clampShipPosition(pos: Vec2): Vec2 {
  let x = Math.max(-52, Math.min(50, pos.x));
  let z = Math.max(-8.2, Math.min(44, pos.z));

  // Avoid colliding into the West bmail concrete pier (x < -52 && z < 26)
  if (x < -51.5 && z < 26) {
    x = -51.5;
  }

  // Avoid colliding into the Eastern Lighthouse headland rocks (center 64, 44, radius 10.5)
  const dx = x - 64;
  const dz = z - 44;
  const dist = Math.hypot(dx, dz);
  if (dist < 10.5) {
    const push = 10.5 / Math.max(dist, 0.01);
    x = 64 + dx * push;
    z = 44 + dz * push;
  }

  return { x, z };
}
