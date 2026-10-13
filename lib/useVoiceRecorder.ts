// ─── 음성 녹음 + STT 캡처 (녹음 파일 + 전사 + 단어별 타임스탬프) ─────────────────────
// 메인 FAB 녹음과 편집기의 "추가" 녹음이 동일한 로직을 공유하도록 분리한 단일 소스.
import { useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { TranscriptSegment } from './storage';
import { sttLang } from './sttLang';
import { canRecordFileWhileRecognizing } from './voiceCapture';
import { hasUsableTimestamps, synthesizeSegmentTimes } from './wordRange';
import { applyFinal, applyPartial, applySessionEnd, emptyMerge, mergedText, type MergeState } from './transcriptMerge';

export type VoiceCaptureResult = {
  uri: string | null;
  transcript: string;
  durationSec: number;
  segments: TranscriptSegment[];
};

export type VoiceRecorderState = { isRecording: boolean; durationMillis: number; metering?: number };

/** 녹음 시작 뒤 인식기를 거는 지연. 예전 300ms는 말 첫머리가 잘려 줄였다 */
export const STT_START_DELAY_MS = 60;

export function useVoiceRecorder(opts?: { fileRecording?: boolean }) {
  // Android 12 이하: 녹음기와 음성 인식기가 마이크를 같이 못 써서 인식만 돌린다 (lib/voiceCapture.ts 참고)
  const fileRecording = opts?.fileRecording ?? canRecordFileWhileRecognizing();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  // expo-audio의 useAudioRecorderState는 녹음 중이 아닐 때도 계속 네이티브를 폴링한다(배터리 낭비).
  // 여기서는 녹음 중에만 100ms마다 상태를 읽고, 끝나면 폴링을 멈춘다.
  const [fileState, setFileState] = useState<VoiceRecorderState>({ isRecording: false, durationMillis: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  const readRecorder = (): VoiceRecorderState => {
    try {
      const st = recorder.getStatus();
      return { isRecording: !!st.isRecording, durationMillis: st.durationMillis ?? 0, metering: st.metering };
    } catch { return { isRecording: false, durationMillis: 0 }; }
  };
  const startPoll = () => {
    stopPoll();
    setFileState(readRecorder());
    pollRef.current = setInterval(() => setFileState(readRecorder()), 100);
  };
  // 인식만 돌릴 때는 녹음기 상태가 없으므로 타이머로 같은 모양의 상태를 만든다
  const [sttOnlyState, setSttOnlyState] = useState<VoiceRecorderState>({ isRecording: false, durationMillis: 0 });
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTick = () => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };
  useEffect(() => () => { stopTick(); stopPoll(); }, []); // 언마운트 시 타이머 정리
  // 인식 전용 모드에서 stop() 뒤 'end'까지 기다리는 중 (마지막 단어가 stop 직후 도착하므로)
  const stoppingRef = useRef(false);
  const runIdRef = useRef(0); // start()가 준비 중일 때 cancel()이 끼어든 것을 알아채기 위한 번호
  const endResolveRef = useRef<(() => void) | null>(null);
  const recorderState: VoiceRecorderState = fileRecording ? fileState : sttOnlyState;

  const [liveText, setLiveText] = useState('');
  // 인식기가 실제로 듣기 시작했는지 — 화면이 '지금 말씀하세요'를 띄우는 신호
  const [listening, setListening] = useState(false);
  const liveTextRef = useRef('');
  const liveSegmentsRef = useRef<TranscriptSegment[]>([]);
  // iOS STT는 중간에 세션이 끊겨 재시작됨 → 이전 세션 결과를 베이스로 누적
  const mergeRef = useRef<MergeState>(emptyMerge());
  const sttBaseSegsRef = useRef<TranscriptSegment[]>([]);
  const recordStartAtRef = useRef(0);
  const sttOffsetMsRef = useRef(0);
  const sttActiveRef = useRef(false);
  // STT 결과가 처음/마지막으로 들어온 시각(녹음 시작 기준 ms) — 단어별 타임스탬프를 못 받았을 때
  // 실제 말한 구간을 추정해 글자 수 비례로 시각을 합성하는 데 쓴다
  const firstResultAtRef = useRef(0);
  const lastResultAtRef = useRef(0);

  useSpeechRecognitionEvent('result', (e) => {
    if (!sttActiveRef.current) return;
    const text = e.results[0]?.transcript ?? '';
    if (text.trim()) {
      const at = Date.now() - recordStartAtRef.current;
      if (!firstResultAtRef.current) firstResultAtRef.current = at;
      lastResultAtRef.current = at;
    }
    // 한 번 들은 말은 지우지 않는다: 빈 결과·마지막 조각만 담긴 확정 결과로 덮어쓰지 않게 이어 붙인다
    mergeRef.current = (e as { isFinal?: boolean }).isFinal
      ? applyFinal(mergeRef.current, text)
      : applyPartial(mergeRef.current, text);
    const combined = mergedText(mergeRef.current);
    if (combined !== liveTextRef.current) setLiveText(combined);
    liveTextRef.current = combined;
    const segs = e.results[0]?.segments;
    if (segs && segs.length) {
      liveSegmentsRef.current = [
        ...sttBaseSegsRef.current,
        ...segs.map((seg) => ({
          segment: seg.segment,
          startTimeMillis: seg.startTimeMillis + sttOffsetMsRef.current,
          endTimeMillis: seg.endTimeMillis + sttOffsetMsRef.current,
        })),
      ];
    }
  });

  useSpeechRecognitionEvent('start', () => {
    if (sttActiveRef.current) setListening(true);
  });

  useSpeechRecognitionEvent('error', (e) => {
    const ignored = ['aborted', 'no-speech', 'audio-capture', 'network'];
    if (ignored.includes(e.error)) return;
    console.warn('STT 에러:', e.error, e.message);
  });

  useSpeechRecognitionEvent('end', () => {
    if (stoppingRef.current) { endResolveRef.current?.(); return; }
    if (!sttActiveRef.current) return;
    mergeRef.current = applySessionEnd(mergeRef.current);
    sttBaseSegsRef.current = liveSegmentsRef.current;
    setTimeout(() => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: sttLang(), interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {}
    }, 200);
  });

  const startSTT = () => {
    sttActiveRef.current = true;
    const attempt = (n: number) => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: sttLang(), interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {
        if (n < 3) setTimeout(() => attempt(n + 1), 400);
      }
    };
    // 녹음기가 마이크를 잡은 직후 바로 인식을 건다 (실패하면 attempt가 0.4초 뒤 다시 시도)
    setTimeout(() => attempt(0), STT_START_DELAY_MS);
  };

  const start = async () => {
    setListening(false);
    setLiveText('');
    liveTextRef.current = '';
    liveSegmentsRef.current = [];
    mergeRef.current = emptyMerge();
    sttBaseSegsRef.current = [];
    sttOffsetMsRef.current = 0;
    firstResultAtRef.current = 0;
    lastResultAtRef.current = 0;
    const run = ++runIdRef.current;
    if (fileRecording) {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      // 준비하는 사이 취소됐으면(화면을 닫음) 녹음을 켜지 않는다 — 안 그러면 화면 없이 마이크만 돈다
      if (run !== runIdRef.current) {
        try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false }); } catch {}
        return;
      }
      recorder.record();
      startPoll();
    } else {
      stopTick();
      const startedAt = Date.now();
      setSttOnlyState({ isRecording: true, durationMillis: 0 });
      tickRef.current = setInterval(() => {
        setSttOnlyState({ isRecording: true, durationMillis: Date.now() - startedAt });
      }, 250);
    }
    recordStartAtRef.current = Date.now();
    startSTT();
  };

  const finishSttOnly = () => {
    stopTick();
    const durationMillis = recordStartAtRef.current ? Date.now() - recordStartAtRef.current : 0;
    setSttOnlyState({ isRecording: false, durationMillis: 0 });
    return durationMillis;
  };

  const cancel = async () => {
    runIdRef.current++;
    sttActiveRef.current = false;
    setListening(false);
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    if (fileRecording) {
      stopPoll();
      setFileState({ isRecording: false, durationMillis: 0 });
      try { await recorder.stop(); } catch {}
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    } else {
      finishSttOnly();
    }
    setLiveText('');
    liveTextRef.current = '';
  };

  const stop = async (): Promise<VoiceCaptureResult> => {
    setListening(false);
    let uri: string | null = null;
    let durationMs = 0;
    if (fileRecording) {
      sttActiveRef.current = false;
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
      // 멈추기 직전 값을 네이티브에서 직접 읽는다 (폴링 상태는 최대 100ms 늦다)
      durationMs = readRecorder().durationMillis || fileState.durationMillis;
      stopPoll();
      setFileState({ isRecording: false, durationMillis: 0 });
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      uri = recorder.uri;
    } else {
      // 전사가 유일한 데이터이므로 최종 결과가 들어올 'end'까지(최대 800ms) 결과를 계속 받는다
      durationMs = finishSttOnly();
      stoppingRef.current = true;
      try { ExpoSpeechRecognitionModule.stop(); } catch {}
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 800);
        endResolveRef.current = () => { clearTimeout(timer); resolve(); };
      });
      endResolveRef.current = null;
      stoppingRef.current = false;
      sttActiveRef.current = false;
    }
    const transcript = liveTextRef.current.trim();
    const durationSec = Math.round(durationMs / 1000);
    let segments = [...liveSegmentsRef.current];
    // 단어 시각이 글의 일부(마지막 조각)만 덮으면 쓰지 않는다 → 상세 화면이 전체 글로 칩을 다시 만든다
    const segChars = segments.reduce((n, sg) => n + sg.segment.replace(/\s/g, '').length, 0);
    if (segments.length && segChars < transcript.replace(/\s/g, '').length * 0.8) segments = [];
    if (segments.length && !hasUsableTimestamps(segments)) {
      // 인식기가 단어별 시각을 안 준 경우: 첫 결과(인식 지연 ~0.4s 보정)부터 마지막 결과까지를 말한 구간으로 보고 배분
      const startMs = Math.max(0, firstResultAtRef.current - 400);
      const endCandidate = lastResultAtRef.current > 0 ? lastResultAtRef.current + 300 : durationMs;
      const endMs = durationMs > 0 ? Math.min(endCandidate, durationMs) : endCandidate;
      segments = synthesizeSegmentTimes(segments, startMs, endMs > startMs ? endMs : durationMs);
    }
    setLiveText('');
    liveTextRef.current = '';
    return { uri: uri ?? null, transcript, durationSec, segments };
  };

  return { recorderState, liveText, listening, start, stop, cancel, fileRecording };
}
