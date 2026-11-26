/**
 * Single source of truth for all HTTP & network error copy and next-step user actions.
 * Every API adapter and UI screen must resolve user-facing error guidance exclusively from here.
 */

export type AppErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'network_offline';

export type ErrorNextActionKind = 'login' | 'request_access' | 'retry';

export interface ErrorDescriptor {
  code: AppErrorCode;
  httpStatusRange: string;
  title: string;
  message: string;
  nextActionLabel: string;
  actionKind: ErrorNextActionKind;
}

export const ERROR_CATALOG: Readonly<Record<AppErrorCode, ErrorDescriptor>> = {
  unauthorized: {
    code: 'unauthorized',
    httpStatusRange: '401',
    title: '로그인이 필요합니다',
    message: 'SGW 세션이 만료되었거나 로그인되어 있지 않습니다. 다시 로그인해 주세요.',
    nextActionLabel: '로그인',
    actionKind: 'login',
  },
  forbidden: {
    code: 'forbidden',
    httpStatusRange: '403',
    title: '권한 없음',
    message: '이 화면 또는 프로젝트에 접근할 권한이 없습니다. 관리자에게 권한을 요청해 주세요.',
    nextActionLabel: '권한 요청',
    actionKind: 'request_access',
  },
  not_found: {
    code: 'not_found',
    httpStatusRange: '404',
    title: '없거나 권한 없음',
    message: '요청한 항목을 찾을 수 없거나 접근 권한이 없습니다.',
    nextActionLabel: '권한 요청',
    actionKind: 'request_access',
  },
  rate_limited: {
    code: 'rate_limited',
    httpStatusRange: '429',
    title: '요청이 너무 많습니다',
    message: '짧은 시간에 요청이 집중되어 일시 제한되었습니다. 잠시 후 다시 시도해 주세요.',
    nextActionLabel: '잠시 후 재시도',
    actionKind: 'retry',
  },
  server_error: {
    code: 'server_error',
    httpStatusRange: '5xx',
    title: '서버 일시 오류',
    message: 'SGW 또는 연동 서버에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    nextActionLabel: '잠시 후 재시도',
    actionKind: 'retry',
  },
  network_offline: {
    code: 'network_offline',
    httpStatusRange: 'network',
    title: '네트워크 연결 끊김',
    message: '서버와 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 잠시 후 다시 시도해 주세요.',
    nextActionLabel: '잠시 후 재시도',
    actionKind: 'retry',
  },
};

export function mapHttpStatusToErrorCode(status: number): AppErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status <= 599) return 'server_error';
  if (status === 0) return 'network_offline';
  return 'server_error';
}

export function getErrorDescriptor(codeOrStatus: AppErrorCode | number): ErrorDescriptor {
  const code =
    typeof codeOrStatus === 'number' ? mapHttpStatusToErrorCode(codeOrStatus) : codeOrStatus;
  return ERROR_CATALOG[code];
}
