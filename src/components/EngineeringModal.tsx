import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Lock, Mail, RotateCw, ShieldAlert, VolumeX, X } from 'lucide-react';
import {
  ALL_POINT_CLOUD_FORMATS,
  ENGINEERING_MODULES,
  type ActorRoleType,
  type ModuleId,
  type PointCloudFormat,
  type ProjectTenant,
} from '../config/fleetConfig';
import { resolveFaroViewerMode } from '../core/spatialEngine';

interface EngineeringModalProps {
  moduleId: ModuleId;
  project: ProjectTenant;
  actorRole: ActorRoleType;
  onCloseWithPurge: (moduleId: ModuleId) => void;
  darkUi: boolean;
}

const SEDMS_DRAWINGS = [
  { id: 'DWG-H1042-0104', title: 'NO.1 화물창 멤브레인 방벽 배치도', rev: 'Rev.04', status: '승인 완료', updated: '2026-11-25' },
  { id: 'DWG-H1042-0218', title: '기관실 메인 배전반 및 비상 발전기 구획', rev: 'Rev.03', status: '검토 중', updated: '2026-11-26' },
  { id: 'DWG-H1042-0309', title: '선수 스러스터 격벽 보강 상세도', rev: 'Rev.02', status: '수정 요청', updated: '2026-11-24' },
];

const INITIAL_CABLES = [
  { tray: 'CT-E101', route: '기관실 → 브리지', loadPct: 68, active: true, voltage: '440V 3Φ' },
  { tray: 'CT-C204', route: '화물제어실 → 펌프타워', loadPct: 54, active: true, voltage: '220V EX-d' },
  { tray: 'CT-N308', route: '레이더 마스트 → 항해콘솔', loadPct: 31, active: true, voltage: '24V DC' },
  { tray: 'CT-B412', route: '비상전원실 → 조타기실', loadPct: 19, active: false, voltage: '440V EM' },
];

const PointCloudViewport: React.FC<{ format: PointCloudFormat; engineLabel: string }> = ({
  format,
  engineLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [yaw, setYaw] = useState(0.55);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#091322';
    ctx.fillRect(0, 0, w, h);

    // Subtle ScanPlan 2D alignment grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Deterministic procedural 3D ship hull + bulkhead point cloud (840 LiDAR points)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const pitch = 0.36;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    for (let i = 0; i < 840; i++) {
      const u = (i % 42) / 41 - 0.5; // length axis
      const v = Math.floor(i / 42) / 19; // height/ring axis
      const angle = v * Math.PI * 2;
      const taper = 1 - Math.pow(Math.abs(u) * 1.9, 2.2);
      const radius = Math.max(0.15, taper) * 1.25;

      const px = u * 4.8;
      const py = Math.sin(angle) * 0.95;
      const pz = Math.cos(angle) * radius;

      // Rotate Y then X
      const rx = px * cosY - pz * sinY;
      const rz1 = px * sinY + pz * cosY;
      const ry = py * cosP - rz1 * sinP;
      const rz = py * sinP + rz1 * cosP;

      const scale = 210 / (5.8 + rz);
      const sx = w * 0.5 + rx * scale;
      const sy = h * 0.52 - ry * scale;

      const hue = Math.round(195 + (py + 1) * 45);
      const alpha = Math.max(0.25, Math.min(0.95, (rz + 3) / 5.5));
      ctx.fillStyle = `hsla(${hue}, 88%, 62%, ${alpha})`;
      ctx.fillRect(sx, sy, 2.2, 2.2);
    }

    // Alignment reticle overlay
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillText(`${engineLabel} · ${format} · ScanPlan 2D Align Δ 0.3px`, 24, 34);
  }, [yaw, format, engineLabel]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
      <canvas
        ref={canvasRef}
        width={680}
        height={250}
        className="w-full h-[220px] sm:h-[250px] block cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          draggingRef.current = true;
          lastXRef.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const dx = e.clientX - lastXRef.current;
          lastXRef.current = e.clientX;
          setYaw((prev) => prev + dx * 0.012);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
      />
      <button
        type="button"
        onClick={() => setYaw((y) => y + 0.6)}
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-100 text-xs font-semibold border border-slate-600 cursor-pointer"
      >
        <RotateCw className="w-3.5 h-3.5" />
        <span>스캔 회전</span>
      </button>
    </div>
  );
};

export const EngineeringModal: React.FC<EngineeringModalProps> = ({
  moduleId,
  project,
  actorRole,
  onCloseWithPurge,
  darkUi,
}) => {
  const mod = ENGINEERING_MODULES.find((m) => m.moduleId === moduleId) ?? ENGINEERING_MODULES[0];
  const isPartner = actorRole === 'partner';

  const [selectedDwg, setSelectedDwg] = useState(SEDMS_DRAWINGS[0]);
  const [cables, setCables] = useState(INITIAL_CABLES);
  const [faroFormat, setFaroFormat] = useState<PointCloudFormat>(isPartner ? '.e57' : '.fls');
  const [secadCutPct, setSecadCutPct] = useState(45);
  const [mailSubject, setMailSubject] = useState('');
  const [sentMails, setSentMails] = useState([
    { id: 'BM-102', to: 'kr-inspector@class.or.kr', subject: `[${project.projectId}] 1번 화물창 도면 승인본 송부`, time: '10:24' },
    { id: 'BM-101', to: 'owner-rep@lng-fleet.com', subject: `[${project.projectId}] 주간 공정 회의록 공유`, time: '어제' },
  ]);

  const faroResolution = resolveFaroViewerMode(actorRole, faroFormat, project.projectId);

  const panelClass = darkUi
    ? 'bg-slate-950 text-slate-50 border-slate-700'
    : 'bg-white text-slate-900 border-slate-300';
  const subCard = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mod.displayName}
        className={`relative w-full max-w-3xl max-h-[86vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
      >
        {/* Partner Read-Only Watermark Overlay */}
        {isPartner && mod.partnerPolicy.watermark && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden opacity-15 select-none"
          >
            <div className="-rotate-24 text-2xl sm:text-4xl font-display font-extrabold tracking-widest text-amber-500 whitespace-nowrap">
              PARTNER READ-ONLY · {project.projectId} · {mod.partnerPolicy.targetDomain}
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-700/40">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-lg">{mod.displayName}</h2>
              <span className="text-xs font-mono-tabular text-sky-500">
                /space/{project.tenantId}/{project.projectId}
              </span>
            </div>
            <p className={`text-xs mt-1 ${muted}`}>
              {isPartner
                ? `◆ 외부 협력사 정책 적용 · ${mod.partnerPolicy.targetDomain} · 읽기 전용`
                : `■ 본사 SSO 인증 완료 · ${mod.ssoEndpoint} · Sandbox(${mod.sandbox})`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCloseWithPurge(mod.moduleId)}
            aria-label="모듈 닫기 및 세션 파기"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            <span>닫기 (세션 파기)</span>
          </button>
        </div>

        {/* Module Body */}
        <div className="p-5 overflow-y-auto meta-scroll space-y-4">
          {mod.moduleId === 'sedms' && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-2 space-y-2">
                <div className="text-xs font-semibold">프로젝트 도면 목록 ({project.projectId})</div>
                {SEDMS_DRAWINGS.map((dwg) => (
                  <button
                    key={dwg.id}
                    type="button"
                    onClick={() => setSelectedDwg(dwg)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                      selectedDwg.id === dwg.id ? 'border-sky-500 ' + subCard : subCard
                    }`}
                  >
                    <div className="font-mono-tabular text-xs text-sky-500 font-semibold">
                      {dwg.id} · {dwg.rev}
                    </div>
                    <div className="text-sm font-semibold mt-0.5">{dwg.title}</div>
                    <div className={`text-xs mt-1 ${muted}`}>
                      {dwg.status} · {dwg.updated}
                    </div>
                  </button>
                ))}
              </div>
              <div className={`md:col-span-3 rounded-xl border p-4 flex flex-col justify-between ${subCard}`}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-sm">{selectedDwg.title}</span>
                    <span className="font-mono-tabular text-xs text-sky-500">{selectedDwg.rev}</span>
                  </div>
                  {/* Clean SVG CAD Blueprint Sheet */}
                  <div className="mt-3 rounded-lg bg-slate-950 border border-slate-700 p-4">
                    <svg viewBox="0 0 420 180" className="w-full h-40" aria-label="도면 CAD 프리뷰">
                      <defs>
                        <pattern id="cadgrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e3a5f" strokeWidth="0.7" />
                        </pattern>
                      </defs>
                      <rect width="420" height="180" fill="url(#cadgrid)" />
                      <path
                        d="M 40 130 L 320 130 Q 375 128 390 88 L 355 54 L 60 54 L 40 130 Z"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                      />
                      <line x1="120" y1="54" x2="120" y2="130" stroke="#7dd3fc" strokeWidth="1.2" strokeDasharray="4 3" />
                      <line x1="210" y1="54" x2="210" y2="130" stroke="#7dd3fc" strokeWidth="1.2" strokeDasharray="4 3" />
                      <line x1="300" y1="54" x2="300" y2="130" stroke="#7dd3fc" strokeWidth="1.2" strokeDasharray="4 3" />
                      <rect x="135" y="68" width="60" height="48" fill="rgba(14,165,233,0.16)" stroke="#f59e0b" strokeWidth="1.4" />
                      <text x="16" y="24" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                        {selectedDwg.id} · SCALE 1:200 · {project.projectId}
                      </text>
                    </svg>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={muted}>
                    {isPartner ? '협력사 읽기 전용 (다운로드·편집 차단)' : '본사 엔지니어 마크업·승인 권한 활성'}
                  </span>
                  {isPartner && (
                    <span className="inline-flex items-center gap-1 text-amber-500 font-semibold">
                      <Lock className="w-3.5 h-3.5" /> Read-Only
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {mod.moduleId === 'secms' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold">SEcMS 배선 트레이 및 계통 제어 ({project.projectId})</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cables.map((c, idx) => (
                  <div key={c.tray} className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${subCard}`}>
                    <div>
                      <div className="font-mono-tabular text-xs font-bold text-teal-500">
                        {c.tray} · {c.voltage}
                      </div>
                      <div className="text-sm font-semibold mt-0.5">{c.route}</div>
                      <div className={`text-xs mt-1 font-mono-tabular ${muted}`}>부하율 {c.loadPct}%</div>
                    </div>
                    <button
                      type="button"
                      disabled={isPartner}
                      onClick={() =>
                        setCables((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, active: !item.active } : item)),
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        isPartner
                          ? 'bg-slate-700/40 text-slate-400 cursor-not-allowed'
                          : c.active
                            ? 'bg-teal-700 hover:bg-teal-600 text-white cursor-pointer'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer'
                      }`}
                    >
                      {isPartner ? '잠김' : c.active ? '통전 중' : '차단됨'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mod.moduleId === 'faro360' && (
            <div className="space-y-4">
              <div className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-2 ${subCard}`}>
                <div>
                  <div className="text-sm font-bold">
                    활성 스트리밍 엔진: <span className="text-sky-500">{faroResolution.engine}</span>
                  </div>
                  <div className={`text-xs mt-0.5 font-mono-tabular ${muted}`}>{faroResolution.targetUrl}</div>
                </div>
                <div className="text-xs font-semibold">
                  {isPartner ? '◆ 협력사 비라이선스 자동 분기 (ViewerFX)' : '■ 본사 정식 라이선스 (10종 포맷 전체)'}
                </div>
              </div>

              {/* 10 Point-Cloud Format Selector */}
              <div>
                <div className="text-xs font-semibold mb-2">지원 점군 포맷 선택 (10종)</div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_POINT_CLOUD_FORMATS.map((fmt) => {
                    const allowed = faroResolution.allowedFormats.includes(fmt);
                    const selected = faroFormat === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setFaroFormat(fmt)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono-tabular font-semibold border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-sky-700 text-white border-sky-400'
                            : allowed
                              ? darkUi
                                ? 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                                : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                              : 'bg-amber-950/30 text-amber-500 border-amber-700/50'
                        }`}
                      >
                        {fmt}
                        {!allowed && ' (제한)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!faroResolution.formatSupported ? (
                <div className="rounded-xl border border-amber-500/60 bg-amber-950/30 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <div className="font-bold text-amber-300 text-sm">
                      외부 협력사 ViewerFX 포맷 정책 차단 ({faroFormat})
                    </div>
                    <p className="mt-1 text-slate-200">
                      비라이선스 외부 협력사 계정은 보안 및 라이선스 정책에 따라 <strong>.e57 · .las · .laz</strong>{' '}
                      포맷만 ViewerFX로 스트리밍할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => setFaroFormat('.e57')}
                      className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold cursor-pointer"
                    >
                      .e57 ViewerFX 호환 포맷으로 전환
                    </button>
                  </div>
                </div>
              ) : (
                <PointCloudViewport format={faroFormat} engineLabel={faroResolution.engine} />
              )}
            </div>
          )}

          {mod.moduleId === 'secad' && (
            <div className="space-y-4">
              <div className={`rounded-xl border p-4 ${subCard}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold">선체 블록 단면 클리핑 (Block B-402)</span>
                  <span className="font-mono-tabular text-xs text-sky-500">Frame #{secadCutPct}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={secadCutPct}
                  onChange={(e) => setSecadCutPct(Number(e.target.value))}
                  aria-label="선체 블록 단면 위치"
                  className="w-full accent-sky-600"
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-mono-tabular">
                  <div className="p-2.5 rounded-lg bg-slate-950 text-slate-100">
                    <div className="text-slate-400">간섭 검사</div>
                    <div className="text-emerald-400 font-bold mt-0.5">0건 (정상)</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 text-slate-100">
                    <div className="text-slate-400">화물창 여유</div>
                    <div className="text-sky-400 font-bold mt-0.5">{(120 + secadCutPct * 0.4).toFixed(1)} mm</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950 text-slate-100">
                    <div className="text-slate-400">WebGL 누수</div>
                    <div className="text-emerald-400 font-bold mt-0.5">0.8% (&lt;5%)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mod.moduleId === 'pdfview' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/50 bg-amber-950/25 p-3.5 flex items-center gap-2.5 text-xs">
                <VolumeX className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Silent Focus Zone 활성</strong> — PDF 열람 구역 진입으로 모든 근접 음성·영상 스트림이 자동
                  음소거 및 소멸되었습니다.
                </span>
              </div>
              <div className={`rounded-xl border p-5 space-y-2.5 ${subCard}`}>
                <div className="font-display font-bold text-sm">
                  [{project.projectId}] 선급 승인 기술 사양서 (Part IV · 전기/배선/안전)
                </div>
                <p className={`text-xs leading-relaxed ${muted}`}>
                  1. 본 프로젝트 메타스페이스 내 모든 도면 및 사양서 열람 이력은 tenant_id 및 project_id 단위로
                  Append-only 감사 로그에 영구 보존됩니다.
                </p>
                <p className={`text-xs leading-relaxed ${muted}`}>
                  2. 외부 협력사 열람 시 브라우저 세션 스토리지 및 WebGL 컨텍스트는 창 종료와 동시에 4단계 파기
                  절차(SGW_SESSION_TERMINATE)를 수행합니다.
                </p>
              </div>
            </div>
          )}

          {mod.moduleId === 'bmail' && (
            <div className="space-y-4">
              <div className="space-y-2">
                {sentMails.map((mail) => (
                  <div key={mail.id} className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${subCard}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{mail.subject}</div>
                      <div className={`text-xs font-mono-tabular ${muted}`}>
                        {mail.id} · 수신: {mail.to}
                      </div>
                    </div>
                    <span className={`text-xs shrink-0 ${muted}`}>{mail.time}</span>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!mailSubject.trim() || isPartner) return;
                  setSentMails((prev) => [
                    {
                      id: `BM-${103 + prev.length}`,
                      to: 'partner-hub@seastar.work',
                      subject: `[${project.projectId}] ${mailSubject.trim()}`,
                      time: '방금',
                    },
                    ...prev,
                  ]);
                  setMailSubject('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  disabled={isPartner}
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                  placeholder={isPartner ? '외부 협력사는 bmail 공식 발신이 제한됩니다' : '공식 bmail 제목 입력…'}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    darkUi ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <button
                  type="submit"
                  disabled={isPartner}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-45 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>발신</span>
                </button>
              </form>
            </div>
          )}

          {/* PostMessageGuard Security Footer */}
          <div className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] ${subCard}`}>
            <span className="inline-flex items-center gap-1.5 font-mono-tabular text-emerald-500 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              PostMessageGuard (ns: sgw:v1 · 30s skew) 활성
            </span>
            <span className={muted}>종료 시 SGW_SESSION_TERMINATE + sessionStorage 소거 실행</span>
          </div>
        </div>
      </div>
    </div>
  );
};
