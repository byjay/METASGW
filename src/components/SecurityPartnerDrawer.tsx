import React, { useState } from 'react';
import { Ban, KeyRound, ShieldCheck, Wifi, X } from 'lucide-react';
import type { MemberRole, ProjectTenant } from '../config/fleetConfig';
import {
  type AuditLogEntry,
  type PartnerInvite,
  type ProjectMembership,
} from '../core/securityEngine';
import { resolveRtcNetworkState } from '../core/spatialEngine';

interface SecurityPartnerDrawerProps {
  project: ProjectTenant;
  memberships: ProjectMembership[];
  invites: PartnerInvite[];
  auditLogs: AuditLogEntry[];
  udpBlocked: boolean;
  onToggleUdpBlocked: () => void;
  onCreateInvite: (orgLabel: string, email: string, role: MemberRole) => void;
  onRevokeMembership: (membershipId: string) => void;
  onSimulateCrossTenant: () => void;
  onClose: () => void;
  darkUi: boolean;
}

export const SecurityPartnerDrawer: React.FC<SecurityPartnerDrawerProps> = ({
  project,
  memberships,
  invites,
  auditLogs,
  udpBlocked,
  onToggleUdpBlocked,
  onCreateInvite,
  onRevokeMembership,
  onSimulateCrossTenant,
  onClose,
  darkUi,
}) => {
  const [orgLabel, setOrgLabel] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('viewer');
  const [formError, setFormError] = useState<string | null>(null);

  const rtc = resolveRtcNetworkState(udpBlocked);
  const projectMembers = memberships.filter((m) => m.projectId === project.projectId);
  const projectInvites = invites.filter((i) => i.projectId === project.projectId);

  const panelClass = darkUi
    ? 'bg-slate-950/96 text-slate-50 border-slate-700'
    : 'bg-white/98 text-slate-900 border-slate-300';
  const subCard = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  return (
    <div
      role="dialog"
      aria-label="멀티테넌트 보안 및 외부 협력사 관리"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(900px,94vw)] max-h-[68vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/40">
        <div>
          <h2 className="font-display font-bold text-base">
            멀티테넌트 격리 · 외부 협력사 포털 · TURN 443 (Role 1)
          </h2>
          <p className={`text-xs mt-0.5 font-mono-tabular ${muted}`}>
            Namespace: /space/{project.tenantId}/{project.projectId} · LiveKit: {project.livekitPrefix}-*
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="보안 관리 닫기"
          className="p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto meta-scroll">
        {/* Left: Partner 1-Time Invite + Active Members with 4-Step Instant Revoke */}
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 space-y-3 ${subCard}`}>
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-500" />
                외부 협력사 1회용 초대 (72h + 6자리 OTP)
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!orgLabel.trim() || !email.trim() || !email.includes('@')) {
                  setFormError('협력사 기관명과 유효한 이메일 주소를 모두 입력해주세요.');
                  return;
                }
                setFormError(null);
                onCreateInvite(orgLabel.trim(), email.trim(), role);
                setOrgLabel('');
                setEmail('');
              }}
              className="space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={orgLabel}
                  onChange={(e) => setOrgLabel(e.target.value)}
                  placeholder="협력사명 (예: 대한선급 KR)"
                  aria-label="협력사 기관명"
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    darkUi ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일 (inspector@kr.or.kr)"
                  aria-label="협력사 이메일"
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    darkUi ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as MemberRole)}
                  aria-label="부여 권한"
                  className={`rounded-lg border px-2.5 py-2 text-xs ${
                    darkUi ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="viewer">viewer (열람 전용)</option>
                  <option value="reviewer">reviewer (도면 검토)</option>
                </select>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  1회용 초대 링크 발급
                </button>
              </div>
              {formError && <p className="text-xs text-rose-400">{formError}</p>}
            </form>

            {projectInvites.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {projectInvites.slice(0, 3).map((inv) => (
                  <div
                    key={inv.inviteId}
                    className="rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-[11px] font-mono-tabular text-slate-200 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {inv.orgLabel} ({inv.emailMasked})
                    </span>
                    <span className="text-amber-400 font-bold shrink-0">OTP {inv.otpCode}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`rounded-xl border p-4 space-y-2.5 ${subCard}`}>
            <div className="font-display font-bold text-sm">프로젝트 멤버십 & 원클릭 4단계 권한 회수</div>
            {projectMembers.map((m) => (
              <div
                key={m.membershipId}
                className="flex items-center justify-between gap-2 py-2 border-b border-slate-700/30 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <span className={m.actorType === 'employee' ? 'text-sky-500' : 'text-amber-500'}>
                      {m.actorType === 'employee' ? '■ [본사]' : '◆ [협력]'}
                    </span>
                    <span>{m.displayLabel}</span>
                    <span className={`font-normal ${muted}`}>· {m.orgLabel}</span>
                  </div>
                  <div className={`text-[11px] font-mono-tabular mt-0.5 ${muted}`}>
                    role={m.memberRole} · v{m.tokenVersion} · status={m.status}
                  </div>
                </div>
                {m.status === 'active' && m.actorType === 'partner' ? (
                  <button
                    type="button"
                    onClick={() => onRevokeMembership(m.membershipId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>즉시 회수</span>
                  </button>
                ) : (
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      m.status === 'revoked' ? 'text-rose-400' : 'text-emerald-500'
                    }`}
                  >
                    {m.status === 'revoked' ? '차단 완료 (4401)' : '활성'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: WebRTC TURN 443 Topology + Cross-Tenant Test + Append-Only Audit Log */}
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 space-y-3 ${subCard}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-bold text-sm flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-sky-500" />
                WebRTC STUN / TURN TCP 443 방화벽 우회
              </span>
              <button
                type="button"
                onClick={onToggleUdpBlocked}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  udpBlocked ? 'bg-amber-700 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
              >
                {udpBlocked ? 'UDP 차단 해제' : '방화벽 UDP 12547 차단 테스트'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular">
              <div className="rounded-lg bg-slate-950 p-2.5 text-slate-100">
                <div className="text-slate-400">전송 계층</div>
                <div className="font-bold text-sky-400 mt-0.5">
                  {rtc.transport.toUpperCase()} {rtc.udpBlocked ? rtc.turnPort : rtc.stunPort}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950 p-2.5 text-slate-100">
                <div className="text-slate-400">위장 모드</div>
                <div className="font-bold text-amber-400 mt-0.5">{rtc.masqueradeMode}</div>
              </div>
              <div className="rounded-lg bg-slate-950 p-2.5 text-slate-100">
                <div className="text-slate-400">전환 지연</div>
                <div className="font-bold text-emerald-400 mt-0.5">{rtc.failoverMs} ms</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onSimulateCrossTenant}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>타 프로젝트(/space/seastar/F310) 침투 차단(4403) 테스트</span>
            </button>
          </div>

          <div className={`rounded-xl border p-4 space-y-2 ${subCard}`}>
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm">Append-Only 감사 로그</span>
              <span className={`text-xs font-mono-tabular ${muted}`}>{auditLogs.length}건 기록</span>
            </div>
            <div className="max-h-52 overflow-y-auto meta-scroll space-y-1.5 pr-1">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg bg-slate-950/80 border border-slate-800 px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center justify-between font-mono-tabular">
                    <span
                      className={
                        log.severity === 'blocked'
                          ? 'text-rose-400 font-bold'
                          : log.severity === 'warn'
                            ? 'text-amber-400 font-bold'
                            : 'text-sky-400 font-semibold'
                      }
                    >
                      {log.eventType}
                    </span>
                    <span className="text-slate-400">{log.timestamp}</span>
                  </div>
                  <div className="text-slate-200 mt-0.5">{log.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
