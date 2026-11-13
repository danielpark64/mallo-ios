// ─── [LONGREC 시험판] 긴 녹음(회의·강의) — 녹음 + 받아쓰기 ────────────────────────────
// 일정 녹음(lib/useVoiceRecorder.ts)과 따로 둔다: 알람·일정 경로를 건드리지 않기 위해서다.
// 다른 점: ① 말소리용 낮은 음질 ② 글을 문단으로 쌓는다(lib/longTranscript.ts)
//          ③ 상태 확인은 1초에 한 번(일정 녹음은 0.1초) ④ 녹음하는 동안 화면을 켜 둔다.
// 타이머는 녹음 중에만 돌고, 멈추면 모두 끈다.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { waitAudioSettled } from './audioPause';
import { LONG_RECORDING } from './longRec';
import { emptyLong, longFinal, longParas, longPartial, longSessionEnd, type LongPara, type LongState } from './longTranscript';
import { isSttBlockedError } from './sttErrors';
import { sttLang } from './sttLang';
import { STT_IOS_CATEGORY } from './useVoiceRecorder';
import { canRecordFileWhileRecognizing } from './voiceCapture';

const KEEP_AWAKE_TAG = 'sayram-longrec';
/** 녹음기가 혼자 멈췄을 때 다시 켜는 최대 횟수 */
const MAX_REVIVES = 20;

export type LongCaptureResult = {
  uri: string | null;
  durationSec: number;
  paras: LongPara[];
  /** 인식기가 다시 시작된 횟수 — 시험판에서 끊김이 얼마나 잦은지 보려고 남긴다 */
  restarts: number;
};

/** 이 폰이 "폰 안에서만 인식"을 지원하는가 */
export function onDeviceSupported(): boolean {
  try { return !!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(); } catch { return false; }
}

export function useLongRecorder() {
  // Android 12 이하: 녹음기와 인식기가 마이크를 같이 못 쓴다 → 시험판은 녹음 파일만 남긴다(lib/voiceCapture.ts)
  const canStt = canRecordFileWhileRecognizing();
  const recorder = useAudioRecorder(LONG_RECORDING);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [paras, setParas] = useState<LongPara[]>([]);
  const [listening, setListening] = useState(false);
  const [sttBlocked, setSttBlocked] = useState(false);
  const [restarts, setRestarts] = useState(0);

  const stRef = useRef<LongState>(emptyLong());
  const activeRef = useRef(false);      // 녹음 중이어야 하는가(우리 쪽 의도)
  const sttOnRef = useRef(false);       // 인식을 계속 돌려야 하는가
  const blockedRef = useRef(false);
  const onDeviceRef = useRef(false);
  const startAtRef = useRef(0);
  const restartsRef = useRef(0);
  const missRef = useRef(0);
  const revivesRef = useRef(0);
  const runRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endWaitRef = useRef<(() => void) | null>(null);
  const sessionAtRef = useRef(0);       // 지금 인식 세션을 켠 시각
  const shortRef = useRef(0);           // 켜자마자 끝난 세션이 이어진 횟수

  const now = () => Date.now() - startAtRef.current;
  const push = (next: LongState) => {
    if (next === stRef.current) return;
    stRef.current = next;
    setParas(longParas(next));
  };

  const startStt = () => {
    if (!sttOnRef.current || blockedRef.current) return;
    sessionAtRef.current = Date.now();
    try {
      ExpoSpeechRecognitionModule.start({
        lang: sttLang(),
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDeviceRef.current,
        iosCategory: STT_IOS_CATEGORY,
      });
    } catch (e) {
      console.warn('긴 녹음: 인식 시작 실패', e);
    }
  };

  useSpeechRecognitionEvent('result', (e) => {
    if (!sttOnRef.current) return;
    const text = e.results[0]?.transcript ?? '';
    push((e as { isFinal?: boolean }).isFinal ? longFinal(stRef.current, text, now()) : longPartial(stRef.current, text, now()));
  });

  useSpeechRecognitionEvent('start', () => {
    if (sttOnRef.current) setListening(true);
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!sttOnRef.current) return;
    if (isSttBlockedError(e.error)) {
      blockedRef.current = true;
      setSttBlocked(true);
      setListening(false);
      return;
    }
    if (!['aborted', 'no-speech', 'audio-capture', 'network'].includes(e.error)) {
      console.warn('긴 녹음: 인식 오류', e.error, e.message);
    }
  });

  // 인식기는 저절로 끝난다(아이폰 약 1분, Android는 말이 멈출 때) → 문단을 닫고 바로 다시 켠다
  useSpeechRecognitionEvent('end', () => {
    if (endWaitRef.current) { endWaitRef.current(); return; }
    if (!sttOnRef.current || blockedRef.current) return;
    setListening(false);
    push(longSessionEnd(stRef.current));
    restartsRef.current++;
    setRestarts(restartsRef.current);
    // 켜자마자 끝나는 일이 이어지면(조용한 방·인식기 오류) 다시 켜는 간격을 5초까지 늘린다 — 0.15초마다 헛돌지 않게
    const lasted = Date.now() - sessionAtRef.current;
    shortRef.current = lasted < 2000 ? shortRef.current + 1 : 0;
    const delay = shortRef.current ? Math.min(5000, 500 * shortRef.current) : 150;
    const run = runRef.current;
    setTimeout(() => { if (run === runRef.current) startStt(); }, delay);
  });

  const stopTick = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  useEffect(() => () => {
    // 화면이 닫히면 마이크·타이머·화면 켜 두기를 모두 끈다.
    // runRef를 올리는 것이 핵심: start()가 await 세 번(세션 정리·오디오 모드·녹음 준비) 중일 때 화면을 닫으면
    // 여기서는 아직 activeRef가 false라 끌 것이 없고, 그 뒤 record()·타이머·화면 켜 두기가 그대로 켜졌다.
    // 번호를 올려 두면 start()가 준비를 마치고 돌아와 번호가 바뀐 것을 보고 아무것도 켜지 않는다.
    runRef.current++;
    sttOnRef.current = false;
    stopTick();
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
    if (activeRef.current) {
      activeRef.current = false;
      try { recorder.stop(); } catch {}
    }
    // 녹음용 오디오 세션을 돌려놓지 않으면 이후 녹음 재생·읽어 주기가 엉킨다(lib/audioPause.ts)
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }).catch(() => {});
  }, []);

  /** 1초마다: 흐른 시간 표시 + (iOS) 녹음기가 혼자 멈췄으면 다시 켠다 — lib/useVoiceRecorder.ts와 같은 방법 */
  const tick = () => {
    setElapsedMs(now());
    if (Platform.OS !== 'ios' || !activeRef.current) return;
    let expoRecording = false;
    let nativeRecording = true;
    try { expoRecording = !!recorder.getStatus().isRecording; } catch {}
    try { nativeRecording = (recorder as { isRecording?: boolean }).isRecording !== false; } catch {}
    if (!expoRecording || nativeRecording) { missRef.current = 0; return; }
    if (++missRef.current >= 2 && revivesRef.current < MAX_REVIVES) {
      revivesRef.current++;
      missRef.current = 0;
      try { recorder.pause(); recorder.record(); } catch (e) { console.warn('긴 녹음: 녹음기 다시 켜기 실패', e); }
    }
  };

  const start = async (opts: { onDevice: boolean }) => {
    const run = ++runRef.current;
    stRef.current = emptyLong();
    setParas([]);
    setElapsedMs(0);
    setRestarts(0);
    setListening(false);
    setSttBlocked(false);
    blockedRef.current = false;
    restartsRef.current = 0;
    missRef.current = 0;
    revivesRef.current = 0;
    shortRef.current = 0;
    onDeviceRef.current = opts.onDevice;
    await waitAudioSettled();
    if (run !== runRef.current) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    try {
      await recorder.prepareToRecordAsync();
    } catch (e) {
      // 준비가 실패하면 녹음용 세션을 돌려놓고 알린다(그냥 두면 allowsRecording:true 가 남는다)
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }); } catch {}
      throw e;
    }
    if (run !== runRef.current) {
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }); } catch {}
      return;
    }
    recorder.record();
    activeRef.current = true;
    startAtRef.current = Date.now();
    setRecording(true);
    try { await activateKeepAwakeAsync(KEEP_AWAKE_TAG); } catch {}
    stopTick();
    tickRef.current = setInterval(tick, 1000);
    if (canStt) {
      sttOnRef.current = true;
      setTimeout(() => { if (run === runRef.current) startStt(); }, 60);
    }
  };

  const stop = async (): Promise<LongCaptureResult> => {
    runRef.current++;
    stopTick();
    const wasActive = activeRef.current;
    activeRef.current = false;
    let durationMs = startAtRef.current ? now() : 0;
    // 마지막 말이 stop 직후에 들어오므로 인식기가 끝날 때까지(최대 1.2초) 결과를 더 받는다
    if (sttOnRef.current && !blockedRef.current) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1200);
        endWaitRef.current = () => { clearTimeout(timer); resolve(); };
        try { ExpoSpeechRecognitionModule.stop(); } catch { clearTimeout(timer); resolve(); }
      });
      endWaitRef.current = null;
    }
    sttOnRef.current = false;
    push(longSessionEnd(stRef.current));
    setListening(false);
    let uri: string | null = null;
    if (wasActive) {
      try {
        const recMs = recorder.getStatus().durationMillis ?? 0;
        if (recMs > 0) durationMs = recMs;
      } catch {}
      try { await recorder.stop(); } catch (e) { console.warn('긴 녹음: 녹음 끝내기 실패', e); }
      uri = recorder.uri ?? null;
    }
    try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }); } catch {}
    try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
    setRecording(false);
    return { uri, durationSec: Math.round(durationMs / 1000), paras: longParas(stRef.current), restarts: restartsRef.current };
  };

  return { recording, elapsedMs, paras, listening, sttBlocked, restarts, canStt, start, stop };
}
