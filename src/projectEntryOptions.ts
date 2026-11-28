/**
 * Pure Project System Entry Option Builder for default Harbor users.
 *
 * Gives regular users a clean selector when entering a project ship:
 *   - SEDMS (도면·프로젝트) via frozen `/api/sedms-sso?return=/project/<id>`
 *   - Unified `/api/meta/*` Hub modules (SEcMS, s360, SECAD, PDF, plus any future registry module)
 *     using strictly server-supplied `entryUrl` (never client-fabricated; null => disabled with honest status)
 *   - SGTALK 팀 채팅, SGW NAS 문서함, bmail 메일
 */

import {
  buildSedmsProjectUrl,
  buildTalkRoomUrl,
  isSafeNavigationUrl,
  SGW_PORTAL_LINKS,
} from './deepLink';
import type { HarborShip } from './mapping';
import type { HubModuleChipItem } from './meta/hubChipModel';
import type { MetaModuleStatus } from './meta/hubTypes';

export interface ProjectEntryOption {
  id: string;
  label: string;
  subtitle: string;
  href: string | null;
  disabled: boolean;
  statusLabel: string;
  status: MetaModuleStatus;
  kind: 'sedms' | 'hub' | 'talk' | 'nas' | 'bmail';
  moduleId?: string;
  previewFeatureLabel: string;
  disabledReason?: string;
}

function buildSafeSedmsHref(projectId: string): string {
  try {
    const raw = buildSedmsProjectUrl(projectId);
    return isSafeNavigationUrl(raw) ? raw : SGW_PORTAL_LINKS.sedmsProjects;
  } catch {
    return SGW_PORTAL_LINKS.sedmsProjects;
  }
}

/**
 * Builds the ordered list of selectable project system entry options for a given ship.
 * Dynamically reflects any modules returned by `/api/meta/registry` + `/api/meta/hub/summary`.
 */
export function buildProjectEntryOptions(
  ship: HarborShip,
  hubChips: readonly HubModuleChipItem[] = [],
): ProjectEntryOption[] {
  const options: ProjectEntryOption[] = [];

  // 1. Primary SEDMS project entry (always first & selected by default)
  const sedmsChip = hubChips.find((c) => c.moduleId === 'sedms');
  const sedmsHref =
    sedmsChip && !sedmsChip.disabled && sedmsChip.entryUrl && isSafeNavigationUrl(sedmsChip.entryUrl)
      ? sedmsChip.entryUrl
      : buildSafeSedmsHref(ship.id);

  options.push({
    id: 'sedms',
    label: 'SEDMS 도면·프로젝트',
    subtitle: sedmsChip?.summaryText || `${ship.code} 도면·배포·승인 진입`,
    href: sedmsHref,
    disabled: false,
    statusLabel: sedmsChip?.statusLabel ?? '정상',
    status: sedmsChip?.status ?? 'active',
    kind: 'sedms',
    moduleId: 'sedms',
    previewFeatureLabel: `SEDMS 프로젝트(${ship.code})`,
  });

  // 2. Dynamic /api/meta/* Hub Modules (SEcMS, s360, SECAD, PDF, future modules)
  //    Skip 'sgw', 'sedms', 'mail' here since they have explicit curated entries below.
  for (const chip of hubChips) {
    if (chip.moduleId === 'sedms' || chip.moduleId === 'sgw' || chip.moduleId === 'mail') {
      continue;
    }
    const validHref =
      !chip.disabled && chip.entryUrl && isSafeNavigationUrl(chip.entryUrl)
        ? chip.entryUrl
        : null;
    options.push({
      id: `hub-${chip.moduleId}`,
      label: chip.name,
      subtitle: chip.summaryText || `${chip.name} (${chip.statusLabel})`,
      href: validHref,
      disabled: validHref === null,
      statusLabel: chip.statusLabel,
      status: chip.status,
      kind: 'hub',
      moduleId: chip.moduleId,
      previewFeatureLabel: `${chip.name}(${ship.code})`,
      disabledReason: chip.disabledReason ?? (validHref === null ? `${chip.statusLabel} · 이동 불가` : undefined),
    });
  }

  // 3. SGTALK Team Chat room for this project
  const talkHref = buildTalkRoomUrl(ship.id);
  options.push({
    id: 'talk',
    label: 'SGTALK 팀 채팅',
    subtitle: `${ship.name} 프로젝트 대화방`,
    href: isSafeNavigationUrl(talkHref) ? talkHref : SGW_PORTAL_LINKS.talkHome,
    disabled: false,
    statusLabel: '정상',
    status: 'active',
    kind: 'talk',
    moduleId: 'sgw',
    previewFeatureLabel: `SGTALK 팀 채팅(${ship.code})`,
  });

  // 4. SGW NAS shared folder
  options.push({
    id: 'nas',
    label: 'SGW NAS 문서함',
    subtitle: '프로젝트 공유 문서 · 도면 저장소',
    href: isSafeNavigationUrl(SGW_PORTAL_LINKS.nas) ? SGW_PORTAL_LINKS.nas : '/',
    disabled: false,
    statusLabel: '정상',
    status: 'active',
    kind: 'nas',
    moduleId: 'sgw',
    previewFeatureLabel: `SGW NAS(${ship.code})`,
  });

  // 5. bmail mail app
  options.push({
    id: 'bmail',
    label: 'bmail 메일',
    subtitle: '프로젝트 관련 사내 메일함 열기',
    href: isSafeNavigationUrl(SGW_PORTAL_LINKS.bmail) ? SGW_PORTAL_LINKS.bmail : '/',
    disabled: false,
    statusLabel: '정상',
    status: 'active',
    kind: 'bmail',
    moduleId: 'mail',
    previewFeatureLabel: `bmail 메일(${ship.code})`,
  });

  return options;
}
