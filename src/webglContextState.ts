/**
 * Pure WebGL context loss / restoration & 3D retry state machine.
 *
 * Guarantees:
 *   - On `webglcontextlost`, automatically falls back to 2D list mode and exposes "3D 를 다시 시도".
 *   - On `webglcontextrestored`, restores 3D mode automatically if fallback was caused by context loss.
 *   - On explicit user retry ("3D 를 다시 시도"), bumps `retryNonce` and switches back to 3D mode.
 */

export type WebGLContextHealth = 'active' | 'lost' | 'unsupported';

export type WebGLFallbackReason = 'context_lost' | 'load_failed' | null;

export interface WebGLViewState {
  webglSupported: boolean;
  contextHealth: WebGLContextHealth;
  fallbackReason: WebGLFallbackReason;
  viewMode: '3d' | '2d';
  autoRestoreTo3D: boolean;
  retryNonce: number;
}

export type WebGLViewEvent =
  | { type: 'CONTEXT_LOST' }
  | { type: 'CONTEXT_RESTORED' }
  | { type: 'LOAD_FAILED' }
  | { type: 'RETRY_3D' }
  | { type: 'SET_VIEW_MODE'; next: '3d' | '2d' };

export const WEBGL_RETRY_BUTTON_LABEL = '3D 를 다시 시도';

export function createInitialWebGLViewState(
  webglSupported: boolean,
  initialViewMode: '3d' | '2d',
): WebGLViewState {
  if (!webglSupported) {
    return {
      webglSupported: false,
      contextHealth: 'unsupported',
      fallbackReason: null,
      viewMode: '2d',
      autoRestoreTo3D: false,
      retryNonce: 0,
    };
  }
  return {
    webglSupported: true,
    contextHealth: 'active',
    fallbackReason: null,
    viewMode: initialViewMode,
    autoRestoreTo3D: false,
    retryNonce: 0,
  };
}

export function transitionWebGLViewState(
  state: WebGLViewState,
  event: WebGLViewEvent,
): WebGLViewState {
  switch (event.type) {
    case 'CONTEXT_LOST': {
      if (!state.webglSupported) return state;
      return {
        ...state,
        contextHealth: 'lost',
        fallbackReason: 'context_lost',
        viewMode: '2d',
        autoRestoreTo3D: state.viewMode === '3d' || state.autoRestoreTo3D,
      };
    }

    case 'LOAD_FAILED': {
      if (!state.webglSupported) return state;
      return {
        ...state,
        contextHealth: 'lost',
        fallbackReason: 'load_failed',
        viewMode: '2d',
        autoRestoreTo3D: false,
      };
    }

    case 'CONTEXT_RESTORED': {
      if (!state.webglSupported) return state;
      return {
        ...state,
        contextHealth: 'active',
        fallbackReason: null,
        viewMode: state.autoRestoreTo3D ? '3d' : state.viewMode,
        autoRestoreTo3D: false,
      };
    }

    case 'RETRY_3D': {
      if (!state.webglSupported) return state;
      return {
        ...state,
        contextHealth: 'active',
        fallbackReason: null,
        viewMode: '3d',
        autoRestoreTo3D: false,
        retryNonce: state.retryNonce + 1,
      };
    }

    case 'SET_VIEW_MODE': {
      if (event.next === '3d' && !state.webglSupported) return state;
      if (event.next === '3d' && state.contextHealth === 'lost') {
        return {
          ...state,
          contextHealth: 'active',
          fallbackReason: null,
          viewMode: '3d',
          autoRestoreTo3D: false,
          retryNonce: state.retryNonce + 1,
        };
      }
      return {
        ...state,
        viewMode: event.next,
        autoRestoreTo3D: event.next === '2d' ? false : state.autoRestoreTo3D,
      };
    }
  }
}
