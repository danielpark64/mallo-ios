// ─── 음성 녹음 + STT 캡처 (녹음 파일 + 전사 + 단어별 타임스탬프) ─────────────────────
// 메인 FAB 녹음과 편집기의 "추가" 녹음이 동일한 로직을 공유하도록 분리한 단일 소스.
import { useRef, useState } from 'react';
import {
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type { TranscriptSegment } from './storage';
import { hasUsableTimestamps, synthesizeSegmentTimes } from './wordRange';

export type VoiceCaptureResult = {
  uri: string | null;
  transcript: string;
  durationSec: number;
  segments: TranscriptSegment[];
};

export function useVoiceRecorder() {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 50);

  const [liveText, setLiveText] = useState('');
  const liveTextRef = useRef('');
  const liveSegmentsRef = useRef<TranscriptSegment[]>([]);
  // iOS STT는 중간에 세션이 끊겨 재시작됨 → 이전 세션 결과를 베이스로 누적
  const sttBaseTextRef = useRef('');
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
    const combined = sttBaseTextRef.current ? sttBaseTextRef.current.trimEnd() + ' ' + text : text;
    setLiveText(combined);
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

  useSpeechRecognitionEvent('error', (e) => {
    const ignored = ['aborted', 'no-speech', 'audio-capture', 'network'];
    if (ignored.includes(e.error)) return;
    console.warn('STT 에러:', e.error, e.message);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!sttActiveRef.current) return;
    sttBaseTextRef.current = liveTextRef.current;
    sttBaseSegsRef.current = liveSegmentsRef.current;
    setTimeout(() => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {}
    }, 200);
  });

  const startSTT = () => {
    sttActiveRef.current = true;
    const attempt = (n: number) => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {
        if (n < 3) setTimeout(() => attempt(n + 1), 400);
      }
    };
    setTimeout(() => attempt(0), 300);
  };

  const start = async () => {
    setLiveText('');
    liveTextRef.current = '';
    liveSegmentsRef.current = [];
    sttBaseTextRef.current = '';
    sttBaseSegsRef.current = [];
    sttOffsetMsRef.current = 0;
    firstResultAtRef.current = 0;
    lastResultAtRef.current = 0;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordStartAtRef.current = Date.now();
    startSTT();
  };

  const cancel = async () => {
    sttActiveRef.current = false;
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    try { await recorder.stop(); } catch {}
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    setLiveText('');
    liveTextRef.current = '';
  };

  const stop = async (): Promise<VoiceCaptureResult> => {
    sttActiveRef.current = false;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    const uri = recorder.uri;
    const transcript = liveTextRef.current.trim();
    const durationMs = recorderState.durationMillis ?? 0;
    const durationSec = Math.round(durationMs / 1000);
    let segments = [...liveSegmentsRef.current];
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

  return { recorderState, liveText, start, stop, cancel };
}
