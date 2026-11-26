export interface GlobalSkillSpec {
  id: string;
  order: number;
  name: string;
  repo: string;
  url: string;
  category: '기획·최소코드' | '디자인·문체' | '기억·시각화·영상';
  trigger: string;
  summary: string;
  eagerTokens: number;
  lazyHeaderTokens: number;
  defaultEnabled: boolean;
}

export const GLOBAL_SKILLS_REGISTRY: GlobalSkillSpec[] = [
  {
    id: 'grill-me',
    order: 1,
    name: 'GrillMe (mattpocock/skills)',
    repo: 'mattpocock/skills',
    url: 'https://github.com/mattpocock/skills',
    category: '기획·최소코드',
    trigger: '/grill-me',
    summary: '작업 전 요구사항과 예외 조건을 심층 인터뷰해 재작업 토큰 낭비를 차단합니다.',
    eagerTokens: 2800,
    lazyHeaderTokens: 22,
    defaultEnabled: true,
  },
  {
    id: 'ponytail',
    order: 2,
    name: 'Ponytail',
    repo: 'DietrichGebert/ponytail',
    url: 'https://github.com/dietrichgebert/ponytail',
    category: '기획·최소코드',
    trigger: '/ponytail',
    summary: '과잉 추상화를 금지하고 브라우저 기본 API와 최소 코드로 유지보수 비용을 줄입니다.',
    eagerTokens: 1650,
    lazyHeaderTokens: 18,
    defaultEnabled: true,
  },
  {
    id: 'ui-ux-pro-max',
    order: 3,
    name: 'UI/UX Pro Max',
    repo: 'nextlevelbuilder/ui-ux-pro-max-skill',
    url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
    category: '디자인·문체',
    trigger: '/ui-ux',
    summary: '194개 업종 디자인 룰과 74개 글꼴 조합으로 천편일률적 AI UI를 방지합니다.',
    eagerTokens: 4200,
    lazyHeaderTokens: 24,
    defaultEnabled: true,
  },
  {
    id: 'marketing-skills',
    order: 4,
    name: 'Marketing Skills',
    repo: 'coreyhaines31/marketingskills',
    url: 'https://github.com/coreyhaines31/marketingskills',
    category: '디자인·문체',
    trigger: '/marketing',
    summary: '53개 마케팅·카피라이팅·CRO·SEO·가격 전략 플레이북을 필요 시 호출합니다.',
    eagerTokens: 3900,
    lazyHeaderTokens: 22,
    defaultEnabled: true,
  },
  {
    id: 'humanizer',
    order: 5,
    name: 'Humanizer (EN)',
    repo: 'blader/humanizer',
    url: 'https://github.com/blader/humanizer',
    category: '디자인·문체',
    trigger: '/humanize',
    summary: '26가지 영문 AI 상투어와 과장 표현을 제거해 자연스러운 문장으로 다듬습니다.',
    eagerTokens: 1900,
    lazyHeaderTokens: 18,
    defaultEnabled: true,
  },
  {
    id: 'im-not-ai',
    order: 6,
    name: 'im-not-ai (한국어)',
    repo: 'epoko77-ai/im-not-ai',
    url: 'https://github.com/epoko77-ai/im-not-ai',
    category: '디자인·문체',
    trigger: '/im-not-ai',
    summary: '70여 가지 한국어 번역투·공허한 맺음말을 제거해 자연스러운 한국어 문체로 교정합니다.',
    eagerTokens: 2100,
    lazyHeaderTokens: 20,
    defaultEnabled: true,
  },
  {
    id: 'claude-mem',
    order: 7,
    name: 'claude-mem',
    repo: 'thedotmack/claude-mem',
    url: 'https://github.com/thedotmack/claude-mem',
    category: '기억·시각화·영상',
    trigger: '/mem',
    summary: '세션 간 핵심 결정과 작업 이력을 압축 메모해 매번 전체 맥락을 다시 읽지 않게 합니다.',
    eagerTokens: 1800,
    lazyHeaderTokens: 20,
    defaultEnabled: true,
  },
  {
    id: 'archify',
    order: 8,
    name: 'Archify',
    repo: 'tt-a1i/archify',
    url: 'https://github.com/tt-a1i/archify',
    category: '기억·시각화·영상',
    trigger: '/archify',
    summary: '시스템 아키텍처와 데이터 흐름을 클릭 가능한 인터랙티브 HTML 다이어그램으로 생성합니다.',
    eagerTokens: 2200,
    lazyHeaderTokens: 20,
    defaultEnabled: true,
  },
  {
    id: 'hyperframes',
    order: 9,
    name: 'Hyperframes',
    repo: 'heygen-com/hyperframes',
    url: 'https://github.com/heygen-com/hyperframes',
    category: '기억·시각화·영상',
    trigger: '/hyperframes',
    summary: 'HTML/CSS 기반으로 모션 그래픽과 MP4 홍보 영상을 코드로 렌더링합니다.',
    eagerTokens: 2450,
    lazyHeaderTokens: 20,
    defaultEnabled: true,
  },
];

export interface TokenOptimizationStats {
  selectedCount: number;
  eagerTotalTokens: number;
  lazyTotalTokens: number;
  savedTokens: number;
  savingsPercent: number;
}

export function calculateSkillTokenBudget(enabledIds: string[]): TokenOptimizationStats {
  const active = GLOBAL_SKILLS_REGISTRY.filter((s) => enabledIds.includes(s.id));
  const eagerTotalTokens = active.reduce((sum, s) => sum + s.eagerTokens, 0);
  const lazyTotalTokens = active.length > 0 ? 45 + active.reduce((sum, s) => sum + s.lazyHeaderTokens, 0) : 0;
  const savedTokens = Math.max(0, eagerTotalTokens - lazyTotalTokens);
  const savingsPercent = eagerTotalTokens > 0 ? Math.round((savedTokens / eagerTotalTokens) * 100) : 0;

  return {
    selectedCount: active.length,
    eagerTotalTokens,
    lazyTotalTokens,
    savedTokens,
    savingsPercent,
  };
}

export function generateMinimalClaudeMd(enabledIds: string[]): string {
  const active = GLOBAL_SKILLS_REGISTRY.filter((s) => enabledIds.includes(s.id));
  const rows = active
    .map((s) => `| ${s.trigger} | ~/.claude/skills/${s.id}/SKILL.md | ${s.summary.split(' ')[0]} · ${s.name} |`)
    .join('\n');

  return `# Global Skill Router (Token-Minimized)
# 원칙: 모든 프로젝트에서 전역 적용하되, 본문은 트리거 일치 시에만 Lazy Read 한다.

## 1. 토큰 최소화 규칙
- 기본 대화에서는 아래 1줄 인덱스만 유지한다 (상시 로드 금지).
- 작업 의도와 일치하는 스킬 파일 1~2개만 선택적으로 읽는다.
- 코드 작성 시 브라우저 기본 기능 우선, 불필요한 래퍼·중복 설명 금지.

## 2. 전역 스킬 라우팅 테이블 (~/.claude/skills)
| Trigger | Path | Role |
| --- | --- | --- |
${rows}
`;
}

export function generateGlobalInstallScript(platform: 'bash' | 'powershell', enabledIds: string[]): string {
  const active = GLOBAL_SKILLS_REGISTRY.filter((s) => enabledIds.includes(s.id));
  const claudeMd = generateMinimalClaudeMd(enabledIds);

  if (platform === 'powershell') {
    const cloneLines = active
      .map(
        (s) =>
          `if (Test-Path "$SkillDir\\${s.id}") { git -C "$SkillDir\\${s.id}" pull --ff-only } else { git clone --depth 1 "${s.url}.git" "$SkillDir\\${s.id}" }`,
      )
      .join('\n');

    return `# Claude Code 전역 스킬 9종 일괄 설치 + 토큰 최소화 라우터 설정 (Windows PowerShell)
$ErrorActionPreference = "Stop"
$ClaudeRoot = "$HOME\\.claude"
$SkillDir = "$ClaudeRoot\\skills"
New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null

${cloneLines}

@'
${claudeMd}
'@ | Set-Content -Encoding UTF8 "$ClaudeRoot\\CLAUDE.md"

Write-Host "전역 스킬 ${active.length}종 설치 및 토큰 최소화 CLAUDE.md 적용 완료: $SkillDir"`;
  }

  const cloneLines = active
    .map(
      (s) =>
        `[ -d "$SKILL_DIR/${s.id}" ] && git -C "$SKILL_DIR/${s.id}" pull --ff-only || git clone --depth 1 "${s.url}.git" "$SKILL_DIR/${s.id}"`,
    )
    .join('\n');

  return `#!/usr/bin/env bash
# Claude Code 전역 스킬 9종 일괄 설치 + 토큰 최소화 라우터 설정 (macOS / Linux)
set -euo pipefail

CLAUDE_ROOT="$HOME/.claude"
SKILL_DIR="$CLAUDE_ROOT/skills"
mkdir -p "$SKILL_DIR"

${cloneLines}

cat <<'EOF' > "$CLAUDE_ROOT/CLAUDE.md"
${claudeMd}
EOF

echo "전역 스킬 ${active.length}종 설치 및 토큰 최소화 CLAUDE.md 적용 완료: $SKILL_DIR"`;
}
