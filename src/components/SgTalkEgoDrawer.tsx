import React, { useState } from 'react';
import { Bot, ClipboardList, FolderLock, Send, ShieldAlert, X } from 'lucide-react';
import type { ActorRoleType, ProjectTenant } from '../config/fleetConfig';
import { validateEgoRequest, validateNasFilePath } from '../core/securityEngine';

export interface ChatMessageItem {
  id: string;
  projectId: string;
  room: string;
  sender: string;
  actorRole: ActorRoleType;
  text: string;
  time: string;
}

export interface WorkOrderItem {
  id: string;
  projectId: string;
  title: string;
  assignee: string;
  zone: string;
  status: 'in_progress' | 'awaiting_review' | 'done';
}

interface SgTalkEgoDrawerProps {
  project: ProjectTenant;
  actorRole: ActorRoleType;
  messages: ChatMessageItem[];
  onSendMessage: (room: string, text: string) => void;
  workOrders: WorkOrderItem[];
  onCreateWorkOrder: (title: string, zone: string) => void;
  onAdvanceWorkOrder: (id: string) => void;
  onAuditTrigger: (
    eventType: 'NAS_PATH_TRAVERSAL_BLOCKED' | 'EGO_EXTERNAL_DENIED',
    summary: string,
  ) => void;
  onClose: () => void;
  darkUi: boolean;
}

const ROOMS = ['#프로젝트-공지', '#도면-리뷰', '#배선-협업'];

export const SgTalkEgoDrawer: React.FC<SgTalkEgoDrawerProps> = ({
  project,
  actorRole,
  messages,
  onSendMessage,
  workOrders,
  onCreateWorkOrder,
  onAdvanceWorkOrder,
  onAuditTrigger,
  onClose,
  darkUi,
}) => {
  const [subTab, setSubTab] = useState<'chat' | 'orders' | 'nas' | 'ego'>('chat');
  const [activeRoom, setActiveRoom] = useState(ROOMS[0]);
  const [draft, setDraft] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [orderZone, setOrderZone] = useState('SEDMS 도면 구역');

  const [nasFilename, setNasFilename] = useState('H1042_Hull_Rev4.pdf');
  const [nasResult, setNasResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [egoPrompt, setEgoPrompt] = useState('');
  const [egoLog, setEgoLog] = useState<Array<{ role: 'user' | 'ego' | 'error'; text: string }>>([
    {
      role: 'ego',
      text: `EGO 에이전트가 프로젝트 ${project.projectId} 불변 컨텍스트에 바인딩되었습니다. 도면 요약, 업무지시 생성 등을 질의하세요.`,
    },
  ]);

  const panelClass = darkUi
    ? 'bg-slate-950/96 text-slate-50 border-slate-700'
    : 'bg-white/98 text-slate-900 border-slate-300';
  const subCard = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  const roomMessages = messages.filter((m) => m.projectId === project.projectId && m.room === activeRoom);
  const projectOrders = workOrders.filter((w) => w.projectId === project.projectId);

  const handleNasTest = (fileToCheck: string) => {
    const check = validateNasFilePath(project.projectId, activeRoom.replace('#', ''), fileToCheck);
    if (!check.allowed) {
      setNasResult({ ok: false, msg: `403 ${check.code} — 상위 경로 탈출 시도 차단됨 (${fileToCheck})` });
      onAuditTrigger('NAS_PATH_TRAVERSAL_BLOCKED', `NAS 상위 탈출 시도 차단: ${fileToCheck}`);
    } else {
      setNasResult({ ok: true, msg: `201 업로드 허용 · 저장 경로: ${check.normalizedPath}` });
    }
  };

  const handleEgoSubmit = (actionName: string, promptText: string) => {
    const check = validateEgoRequest(
      {
        projectId: project.projectId,
        userId: actorRole === 'employee' ? 'emp-captain' : 'partner-guest',
        role: actorRole === 'employee' ? 'engineer' : 'viewer',
        isExternal: actorRole === 'partner',
        allowedRoomIds: [project.sgtalkChannelId],
      },
      actionName,
    );

    if (!check.allowed) {
      setEgoLog((prev) => [
        ...prev,
        { role: 'user', text: promptText },
        { role: 'error', text: `[${check.code}] ${check.reason}` },
      ]);
      if (check.code === 'EGO_AI_ACCESS_DENIED_FOR_EXTERNAL') {
        onAuditTrigger('EGO_EXTERNAL_DENIED', `외부 협력사 EGO AI 질의 차단 (${actionName})`);
      }
      return;
    }

    setEgoLog((prev) => [
      ...prev,
      { role: 'user', text: promptText },
      {
        role: 'ego',
        text: `[${project.projectId} 컨텍스트] 현재 진행 중인 업무지시 ${projectOrders.length}건, 미검토 도면 1건(DWG-H1042-0218)이 확인되었습니다. 카카오톡 의존성 0건으로 SGTALK DB에 단일 기록됩니다.`,
      },
    ]);
  };

  return (
    <div
      role="dialog"
      aria-label="SGTALK 및 EGO 커뮤니케이션 허브"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(860px,94vw)] h-[min(540px,68vh)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
    >
      {/* Header + Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-700/40">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display font-bold text-base">SGTALK · EGO ({project.projectId})</h2>
          <div className="flex items-center gap-1" role="tablist" aria-label="SGTALK 기능 탭">
            {(
              [
                ['chat', '영구 채팅'],
                ['orders', '업무지시'],
                ['nas', 'NAS 보안업로드'],
                ['ego', 'EGO AI'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={subTab === id}
                onClick={() => setSubTab(id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  subTab === id
                    ? 'bg-sky-700 text-white'
                    : darkUi
                      ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="SGTALK 닫기"
          className="p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
        {subTab === 'chat' && (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {ROOMS.map((rm) => (
                <button
                  key={rm}
                  type="button"
                  onClick={() => setActiveRoom(rm)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                    activeRoom === rm
                      ? 'bg-sky-700 text-white'
                      : darkUi
                        ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {rm}
                </button>
              ))}
              <span className={`ml-auto text-[11px] whitespace-nowrap ${muted}`}>
                카톡 제거 · SQL SoT 격리 ({project.projectId})
              </span>
            </div>

            <div className={`flex-1 min-h-0 overflow-y-auto meta-scroll rounded-xl border p-3.5 space-y-2.5 ${subCard}`}>
              {roomMessages.length === 0 ? (
                <p className={`text-xs ${muted}`}>아직 메시지가 없습니다. 프로젝트 팀과 첫 메시지를 남겨보세요.</p>
              ) : (
                roomMessages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          msg.actorRole === 'employee' ? 'text-sky-500' : 'text-amber-500'
                        }`}
                      >
                        {msg.actorRole === 'employee' ? '■ [본사]' : '◆ [협력]'} {msg.sender}
                      </span>
                      <span className={`font-mono-tabular ${muted}`}>{msg.time}</span>
                    </div>
                    <p className="mt-0.5 leading-relaxed">{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                onSendMessage(activeRoom, draft.trim());
                setDraft('');
              }}
              className="flex gap-2"
            >
              <label htmlFor="sgtalk-input" className="sr-only">
                메시지 입력
              </label>
              <input
                id="sgtalk-input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`${activeRoom}에 영구 기록 메시지 입력…`}
                className={`flex-1 rounded-xl border px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  darkUi ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>전송</span>
              </button>
            </form>
          </div>
        )}

        {subTab === 'orders' && (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!orderTitle.trim()) return;
                onCreateWorkOrder(orderTitle.trim(), orderZone);
                setOrderTitle('');
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                type="text"
                value={orderTitle}
                onChange={(e) => setOrderTitle(e.target.value)}
                placeholder="신규 업무지시 제목 입력…"
                className={`flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-xs ${
                  darkUi ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <select
                value={orderZone}
                onChange={(e) => setOrderZone(e.target.value)}
                aria-label="업무지시 대상 구역"
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  darkUi ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option>SEDMS 도면 구역</option>
                <option>SEcMS 배선 구역</option>
                <option>FARO 360 스캔 구역</option>
                <option>SECAD 3D 도크</option>
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>지시 등록</span>
              </button>
            </form>

            <div className="flex-1 overflow-y-auto meta-scroll space-y-2">
              {projectOrders.map((order) => {
                const statusText =
                  order.status === 'done' ? '완료됨' : order.status === 'awaiting_review' ? '검토 대기' : '진행 중';
                return (
                  <div key={order.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${subCard}`}>
                    <div>
                      <div className="text-sm font-semibold">{order.title}</div>
                      <div className={`text-xs mt-0.5 ${muted}`}>
                        {order.zone} · 담당: {order.assignee} · 상태: {statusText}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAdvanceWorkOrder(order.id)}
                      className="px-3 py-1.5 rounded-lg bg-sky-700/20 hover:bg-sky-700/35 text-sky-400 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      단계 전환
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subTab === 'nas' && (
          <div className="space-y-3 overflow-y-auto meta-scroll">
            <div className={`rounded-xl border p-4 space-y-3 ${subCard}`}>
              <div className="flex items-center gap-2 font-display font-bold text-sm">
                <FolderLock className="w-4 h-4 text-sky-500" />
                <span>NAS 경로 상위 탈출 방지 검증 (SEC-04)</span>
              </div>
              <p className={`text-xs ${muted}`}>
                프로젝트 격리 경로(<code>projects/{project.projectId}/rooms/…</code>) 외 <code>../</code> 또는 심볼릭
                링크 탈출 시도를 즉시 403 차단합니다.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={nasFilename}
                  onChange={(e) => setNasFilename(e.target.value)}
                  aria-label="업로드 테스트 파일명"
                  className={`flex-1 min-w-[200px] rounded-lg border px-3 py-2 text-xs font-mono-tabular ${
                    darkUi ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => handleNasTest(nasFilename)}
                  className="px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer"
                >
                  업로드 검증
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const evil = '../../etc/passwd';
                    setNasFilename(evil);
                    handleNasTest(evil);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold cursor-pointer"
                >
                  ../ 공격 시뮬레이션
                </button>
              </div>
              {nasResult && (
                <div
                  className={`rounded-lg p-3 text-xs font-mono-tabular border ${
                    nasResult.ok
                      ? 'bg-emerald-950/35 border-emerald-600/50 text-emerald-300'
                      : 'bg-rose-950/45 border-rose-500/60 text-rose-200'
                  }`}
                >
                  {nasResult.msg}
                </div>
              )}
            </div>
          </div>
        )}

        {subTab === 'ego' && (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {actorRole === 'partner' && (
              <div className="rounded-xl border border-amber-500/60 bg-amber-950/35 p-3 flex items-center gap-2.5 text-xs text-amber-200">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  외부 협력사 계정으로 접속 중입니다. EGO AI 호출 시 <strong>EGO_AI_ACCESS_DENIED_FOR_EXTERNAL</strong>{' '}
                  보안 경계가 작동합니다 (SEC-05).
                </span>
              </div>
            )}

            <div className={`flex-1 min-h-0 overflow-y-auto meta-scroll rounded-xl border p-3.5 space-y-2.5 ${subCard}`}>
              {egoLog.map((entry, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg p-2.5 text-xs leading-relaxed ${
                    entry.role === 'error'
                      ? 'bg-rose-950/50 border border-rose-500/50 text-rose-200 font-mono-tabular'
                      : entry.role === 'user'
                        ? 'bg-sky-900/35 text-sky-200'
                        : darkUi
                          ? 'bg-slate-950 text-slate-200'
                          : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  <div className="font-semibold mb-0.5 flex items-center gap-1.5">
                    {entry.role === 'ego' && <Bot className="w-3.5 h-3.5 text-sky-400" />}
                    <span>{entry.role === 'user' ? '요청' : entry.role === 'error' ? '보안 경계 차단' : 'EGO 에이전트'}</span>
                  </div>
                  {entry.text}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={egoPrompt}
                onChange={(e) => setEgoPrompt(e.target.value)}
                placeholder="EGO에게 프로젝트 현황 질의…"
                className={`flex-1 min-w-[180px] rounded-xl border px-3 py-2 text-xs ${
                  darkUi ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  const q = egoPrompt.trim() || `${project.projectId} 미결 도면 및 업무지시 요약해줘`;
                  handleEgoSubmit('QUERY_PROJECT_SUMMARY', q);
                  setEgoPrompt('');
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer"
              >
                EGO 질의
              </button>
              <button
                type="button"
                onClick={() => handleEgoSubmit('SEND_EXTERNAL_EMAIL', '선주사 외부 메일 즉시 발송 실행')}
                className="px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold cursor-pointer"
              >
                외부 발송 권한 테스트
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
