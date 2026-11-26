export interface VrmVisemeWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
  volume: number;
}

export const ZERO_VISEMES: VrmVisemeWeights = {
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
  volume: 0,
};

/**
 * Pure FFT Spectrum -> VRM 5-Vowel Viseme Weight Estimator (aa, ih, ou, ee, oh)
 * Analyzes human speech formant frequency bands (F1: 250-900Hz, F2: 900-3200Hz)
 * with RMS noise gate so mouth shapes react naturally to real voice input.
 */
export function computeVisemesFromSpectrum(
  bins: Uint8Array,
  sampleRate = 48000,
  fftSize = 256,
  noiseGate = 0.08,
): VrmVisemeWeights {
  if (bins.length === 0) return { ...ZERO_VISEMES };

  const hzPerBin = sampleRate / fftSize;
  const bandEnergy = (lowHz: number, highHz: number): number => {
    const start = Math.max(0, Math.floor(lowHz / hzPerBin));
    const end = Math.min(bins.length - 1, Math.ceil(highHz / hzPerBin));
    if (end < start) return 0;
    let sum = 0;
    for (let i = start; i <= end; i++) {
      sum += bins[i] / 255;
    }
    return sum / (end - start + 1);
  };

  // Speech formant energy bands
  const lowF1 = bandEnergy(220, 520); // Strong in 'ou', 'ih'
  const midF1 = bandEnergy(520, 1050); // Strong in 'aa', 'oh'
  const lowF2 = bandEnergy(1050, 1850); // Strong in 'aa', 'ee'
  const highF2 = bandEnergy(1850, 3400); // Strong in 'ih', 'ee'

  const volume = Math.min(1, (lowF1 * 0.25 + midF1 * 0.35 + lowF2 * 0.25 + highF2 * 0.15) * 1.65);
  if (volume < noiseGate) {
    return { ...ZERO_VISEMES };
  }

  const norm = Math.max(0.001, lowF1 + midF1 + lowF2 + highF2);
  const gain = Math.min(1, (volume - noiseGate) / (1 - noiseGate));

  // Formant dominance mapping to VRM standard 5 vowel blendshapes
  const aa = Math.min(1, ((midF1 + lowF2 * 0.7) / norm) * 1.45 * gain);
  const ih = Math.min(1, ((highF2 * 1.15 + lowF1 * 0.4) / norm) * 1.35 * gain);
  const ou = Math.min(1, ((lowF1 * 1.3) / norm) * 1.3 * gain);
  const ee = Math.min(1, ((lowF2 * 0.8 + highF2 * 0.85) / norm) * 1.25 * gain);
  const oh = Math.min(1, ((lowF1 * 0.75 + midF1 * 0.85) / norm) * 1.2 * gain);

  return {
    aa: Math.round(aa * 1000) / 1000,
    ih: Math.round(ih * 1000) / 1000,
    ou: Math.round(ou * 1000) / 1000,
    ee: Math.round(ee * 1000) / 1000,
    oh: Math.round(oh * 1000) / 1000,
    volume: Math.round(volume * 1000) / 1000,
  };
}

/**
 * Exponential attack/release viseme smoothing so VRM mouth transitions cleanly without jitter.
 */
export function smoothVisemes(
  prev: VrmVisemeWeights,
  target: VrmVisemeWeights,
  dt: number,
): VrmVisemeWeights {
  const blend = (a: number, b: number) => {
    const rate = b > a ? 22 : 14; // Faster mouth open (attack), smooth close (release)
    const k = 1 - Math.exp(-rate * Math.min(dt, 0.1));
    return a + (b - a) * k;
  };
  return {
    aa: blend(prev.aa, target.aa),
    ih: blend(prev.ih, target.ih),
    ou: blend(prev.ou, target.ou),
    ee: blend(prev.ee, target.ee),
    oh: blend(prev.oh, target.oh),
    volume: blend(prev.volume, target.volume),
  };
}

export type LipSyncMode = 'off' | 'mic' | 'demo_voice';

/**
 * Web Audio API Real-Time Microphone FFT Lip-Sync + 3D Spatial Audio Listener Controller
 */
export class VrmAudioLipSyncController {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private spectrumBuf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(128));
  private mode: LipSyncMode = 'off';
  private silentZoneMuted = false;
  private currentVisemes: VrmVisemeWeights = { ...ZERO_VISEMES };

  public getMode(): LipSyncMode {
    return this.mode;
  }

  public setSilentZoneMuted(muted: boolean): void {
    this.silentZoneMuted = muted;
    if (muted && this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
    } else if (!muted && this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
    }
  }

  /**
   * Starts real live microphone FFT capture via Web Audio API AnalyserNode.
   * Falls back cleanly to 'demo_voice' speech-cadence formant synthesis if mic permission is denied.
   */
  public async enableLiveMic(): Promise<{ mode: LipSyncMode; message: string }> {
    this.stop();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.mode = 'demo_voice';
        return { mode: 'demo_voice', message: '마이크 장치 미지원 — 실시간 5모음 포먼트 음성 시뮬레이션 모드로 동작합니다.' };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);

      this.audioCtx = ctx;
      this.analyser = analyser;
      this.mediaStream = stream;
      this.spectrumBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.mode = 'mic';
      this.setSilentZoneMuted(this.silentZoneMuted);

      return { mode: 'mic', message: '실시간 마이크 FFT 5모음(A/I/U/E/O) VRM 립싱크가 활성화되었습니다.' };
    } catch {
      this.mode = 'demo_voice';
      return {
        mode: 'demo_voice',
        message: '마이크 권한이 거부되어 5모음 포먼트 립싱크 테스트(Demo Voice) 모드로 전환되었습니다.',
      };
    }
  }

  public enableDemoVoice(): void {
    this.stop();
    this.mode = 'demo_voice';
  }

  public stop(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.analyser = null;
    this.mode = 'off';
  }

  /**
   * Syncs Web Audio API 3D AudioListener orientation with the Three.js camera every frame.
   */
  public syncSpatialListener(
    pos: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number },
  ): void {
    if (!this.audioCtx) return;
    const listener = this.audioCtx.listener;
    const t = this.audioCtx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(pos.x, t);
      listener.positionY.setValueAtTime(pos.y, t);
      listener.positionZ.setValueAtTime(pos.z, t);
      listener.forwardX.setValueAtTime(forward.x, t);
      listener.forwardY.setValueAtTime(forward.y, t);
      listener.forwardZ.setValueAtTime(forward.z, t);
      listener.upX.setValueAtTime(up.x, t);
      listener.upY.setValueAtTime(up.y, t);
      listener.upZ.setValueAtTime(up.z, t);
    }
  }

  /**
   * Samples current frame's smoothed 5-vowel VRM viseme weights.
   * Immediately decays to ZERO_VISEMES inside PDF VIEW Silent Focus Zone!
   */
  public sample(dt: number, elapsed: number, forceTalkPreview = false): VrmVisemeWeights {
    if (this.silentZoneMuted) {
      this.currentVisemes = smoothVisemes(this.currentVisemes, ZERO_VISEMES, dt);
      return this.currentVisemes;
    }

    let rawTarget: VrmVisemeWeights = ZERO_VISEMES;

    if (this.mode === 'mic' && this.analyser && this.audioCtx) {
      this.analyser.getByteFrequencyData(this.spectrumBuf);
      rawTarget = computeVisemesFromSpectrum(
        this.spectrumBuf,
        this.audioCtx.sampleRate,
        this.analyser.fftSize,
      );
    } else if (this.mode === 'demo_voice' || forceTalkPreview) {
      // Realistic syllable-cadence 5-vowel speech synthesis envelope (NOT a monotonic sine wave)
      const phrase = Math.sin(elapsed * 2.1) + Math.sin(elapsed * 3.7) * 0.6;
      const speaking = phrase > -0.25;
      if (speaking) {
        const syllable = Math.max(0, Math.sin(elapsed * 9.5) * 0.55 + Math.cos(elapsed * 14.3) * 0.45);
        const vowelPhase = Math.floor(elapsed * 4.2) % 5;
        rawTarget = {
          aa: vowelPhase === 0 ? syllable * 0.92 : syllable * 0.12,
          ih: vowelPhase === 1 ? syllable * 0.85 : syllable * 0.08,
          ou: vowelPhase === 2 ? syllable * 0.82 : syllable * 0.06,
          ee: vowelPhase === 3 ? syllable * 0.88 : syllable * 0.1,
          oh: vowelPhase === 4 ? syllable * 0.86 : syllable * 0.1,
          volume: syllable,
        };
      }
    }

    this.currentVisemes = smoothVisemes(this.currentVisemes, rawTarget, dt);
    return this.currentVisemes;
  }

  public dispose(): void {
    this.stop();
  }
}
