import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, Copy, Download, ExternalLink, Play, X } from 'lucide-react';
import { AGENT_ROLES, ROADMAP_PHASES, type ProjectTenant } from '../config/fleetConfig';
import {
  calculateSkillTokenBudget,
  generateGlobalInstallScript,
  generateMinimalClaudeMd,
  GLOBAL_SKILLS_REGISTRY,
} from '../config/globalSkillsConfig';
import { runAutomatedQaSuite, type QaCheckResult } from '../core/securityEngine';
import type { HarborTelemetry } from '../scene/HarborScene';

interface GovernanceQaDrawerProps {
  project: ProjectTenant;
  telemetry: HarborTelemetry;
  onClose: () => void;
  darkUi: boolean;
}

export const GovernanceQaDrawer: React.FC<GovernanceQaDrawerProps> = ({
  project,
  telemetry,
  onClose,
  darkUi,
}) => {
  const [qaResults, setQaResults] = useState<QaCheckResult[]>(() =>
    runAutomatedQaSuite(project.tenantId, project.projectId),
  );
  const [activeSub, setActiveSub] = useState<'roles' | 'qa' | 'roadmap'>('qa');

  const panelClass = darkUi
    ? 'bg-slate-950/96 text-slate-50 border-slate-700'
    : 'bg-white/98 text-slate-900 border-slate-300';
  const subCard = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  const passCount = qaResults.filter((r) => r.passed).length;

  return (
    <div
      role="dialog"
      aria-label="5개 역할 거버넌스 및 QA 검증 센터"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(900px,94vw)] max-h-[68vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-700/40">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display font-bold text-base">
            전체관리 + Role 1~3 통합 지휘 · QA/장애주입(F-01~F-06)
          </h2>
          <div className="flex items-center gap-1">
            {(
              [
                ['qa', `자동 QA·장애주입 (${passCount}/${qaResults.length})`],
                ['roles', '전체관리 · Role 1~5 소유권'],
                ['roadmap', '3D RPG 로드맵'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSub(id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  activeSub === id
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
          aria-label="QA 센터 닫기"
          className="p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 overflow-y-auto meta-scroll space-y-4">
        {activeSub === 'qa' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={`text-xs font-mono-tabular ${muted}`}>
                Colyseus 3D AoI: {telemetry.dhtInterestCount}척 · Action: {telemetry.actionState} · 선예측:{' '}
                {telemetry.predictedZoneName ?? '오픈 수로'} · FPS: {telemetry.fpsEstimate}
              </div>
              <button
                type="button"
                onClick={() => setQaResults(runAutomatedQaSuite(project.tenantId, project.projectId))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>SEC-01~05 · F-01~06 재검증</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {qaResults.map((item) => (
                <div key={item.code} className={`rounded-xl border p-3.5 ${subCard}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-bold text-sky-500">
                      {item.code} · {item.category}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        item.passed ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {item.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  <div className="text-sm font-semibold mt-1">{item.title}</div>
                  <div className={`text-xs mt-1 ${muted}`}>{item.detail}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeSub === 'roles' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {AGENT_ROLES.map((role) => {
              const isDirectLead = role.roleNumber <= 3;
              return (
                <div
                  key={role.roleNumber}
                  className={`rounded-xl border p-4 space-y-1.5 ${
                    isDirectLead ? 'border-sky-500/70 ' + subCard : subCard
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold text-sm">
                      Role {role.roleNumber} · {role.title}
                    </span>
                    <span
                      className={`text-[11px] font-mono-tabular font-bold whitespace-nowrap ${
                        isDirectLead ? 'text-sky-500' : muted
                      }`}
                    >
                      {isDirectLead ? '직접 총괄 (Lead)' : '계약 연동'}
                    </span>
                  </div>
                  <p className={`text-xs ${muted}`}>{role.leadDomain}</p>
                  <div className="text-[11px] font-mono-tabular text-emerald-500">
                    소유: {role.ownedPaths.join(', ')}
                  </div>
                  <div className="text-[11px] text-amber-500">격리 규칙: {role.forbiddenRule}</div>
                </div>
              );
            })}
          </div>
        )}

        {activeSub === 'roadmap' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ROADMAP_PHASES.map((ph) => (
              <div key={ph.phase} className={`rounded-xl border p-3.5 space-y-2 ${subCard}`}>
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-sky-500">{ph.phase}</span>
                  <span className="text-[11px] font-semibold">
                    {ph.status === 'completed' ? '완료' : ph.status === 'active' ? '진행 중' : '예정'}
                  </span>
                </div>
                <div className="text-sm font-semibold">{ph.title}</div>
                <div className={`text-[11px] font-mono-tabular ${muted}`}>{ph.period}</div>
                <ul className={`text-xs space-y-1 pt-1 ${muted}`}>
                  {ph.deliverables.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface GlobalSkillsDrawerProps {
  onClose: () => void;
  darkUi: boolean;
}

export const GlobalSkillsDrawer: React.FC<GlobalSkillsDrawerProps> = ({ onClose, darkUi }) => {
  const [enabledIds, setEnabledIds] = useState<string[]>(() =>
    GLOBAL_SKILLS_REGISTRY.map((s) => s.id),
  );
  const [platform, setPlatform] = useState<'bash' | 'powershell' | 'claudemd'>('bash');
  const [copied, setCopied] = useState(false);

  const stats = useMemo(() => calculateSkillTokenBudget(enabledIds), [enabledIds]);

  const generatedContent = useMemo(() => {
    if (platform === 'claudemd') return generateMinimalClaudeMd(enabledIds);
    return generateGlobalInstallScript(platform, enabledIds);
  }, [platform, enabledIds]);

  const toggleSkill = (id: string) => {
    setEnabledIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    const filename =
      platform === 'bash'
        ? 'install-global-claude-skills.sh'
        : platform === 'powershell'
          ? 'install-global-claude-skills.ps1'
          : 'CLAUDE.md';
    const blob = new Blob([generatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const panelClass = darkUi
    ? 'bg-slate-950/96 text-slate-50 border-slate-700'
    : 'bg-white/98 text-slate-900 border-slate-300';
  const subCard = darkUi ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted = darkUi ? 'text-slate-300' : 'text-slate-600';

  return (
    <div
      role="dialog"
      aria-label="클로드 코드 전역 스킬 9종 설치 및 토큰 최소화"
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(920px,94vw)] max-h-[70vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${panelClass}`}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/40">
        <div>
          <h2 className="font-display font-bold text-base">
            전역 스킬 9종 일괄 설치 & 토큰 최소화 라우터 (~/.claude/skills)
          </h2>
          <p className={`text-xs mt-0.5 ${muted}`}>
            모든 프로젝트 전역에 9개 저장소를 설치하되, 트리거 일치 시에만 Lazy Read하여 상시 토큰을{' '}
            <strong className="text-emerald-500 font-mono-tabular">{stats.savingsPercent}%</strong> 절감합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="전역 스킬 도구 닫기"
          className="p-2 rounded-lg hover:bg-slate-800/40 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto meta-scroll">
        {/* Left 7 cols: 9 Skills Toggle Checklist + Token Budget Summary */}
        <div className="lg:col-span-7 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular">
            <div className={`rounded-xl border p-3 ${subCard}`}>
              <div className={muted}>상시 전체 로드 시</div>
              <div className="text-base font-bold text-rose-400 mt-0.5">
                {stats.eagerTotalTokens.toLocaleString()} tok
              </div>
            </div>
            <div className={`rounded-xl border p-3 ${subCard}`}>
              <div className={muted}>Lazy 라우터 적용 시</div>
              <div className="text-base font-bold text-emerald-500 mt-0.5">
                {stats.lazyTotalTokens.toLocaleString()} tok
              </div>
            </div>
            <div className={`rounded-xl border p-3 ${subCard}`}>
              <div className={muted}>매 턴 절감률</div>
              <div className="text-base font-bold text-sky-500 mt-0.5">-{stats.savingsPercent}%</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GLOBAL_SKILLS_REGISTRY.map((skill) => {
              const checked = enabledIds.includes(skill.id);
              return (
                <div
                  key={skill.id}
                  className={`rounded-xl border p-3 flex items-start gap-2.5 ${
                    checked ? 'border-sky-600/60 ' + subCard : subCard
                  }`}
                >
                  <input
                    id={`skill-${skill.id}`}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSkill(skill.id)}
                    className="mt-1 accent-sky-600 w-4 h-4 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <label htmlFor={`skill-${skill.id}`} className="text-xs font-bold cursor-pointer truncate">
                        {skill.order}. {skill.name}
                      </label>
                      <a
                        href={skill.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${skill.name} GitHub 저장소 열기`}
                        className="text-sky-500 hover:text-sky-400 shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-sky-500 mt-0.5">
                      {skill.trigger} · {skill.lazyHeaderTokens}t (vs {skill.eagerTokens}t)
                    </div>
                    <p className={`text-[11px] mt-1 leading-snug ${muted}`}>{skill.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 5 cols: Ready-to-run Global Installer Script & Minimal CLAUDE.md */}
        <div className="lg:col-span-5 min-w-0 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['bash', 'macOS/Linux'],
                  ['powershell', 'Windows PS'],
                  ['claudemd', 'CLAUDE.md'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatform(id)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                    platform === id
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
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '복사됨' : '복사'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                aria-label="설치 스크립트 다운로드"
                className={`p-1.5 rounded-lg cursor-pointer ${
                  darkUi ? 'bg-slate-800 hover:bg-slate-700 text-slate-100' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                }`}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          <pre className="flex-1 min-h-[260px] max-h-[360px] overflow-auto meta-scroll rounded-xl bg-slate-950 text-slate-200 border border-slate-700 p-3 text-[11px] font-mono-tabular leading-relaxed whitespace-pre-wrap">
            {generatedContent}
          </pre>

          <p className={`text-[11px] leading-relaxed ${muted}`}>
            실행 방법: 로컬 터미널에서 위 스크립트를 실행하면 <code>~/.claude/skills</code>에 9개 저장소가 전역
            설치되고 <code>~/.claude/CLAUDE.md</code>에 토큰 최소화 트리거 인덱스가 자동 적용됩니다.
          </p>
        </div>
      </div>
    </div>
  );
};
