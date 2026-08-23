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
  const [sttReady, setSttReady] = useState(false);
  const liveTextRef = useRef('');
  const liveSegmentsRef = useRef<TranscriptSegment[]>([]);
  // iOS STT는 중간에 세션이 끊겨 재시작됨 → 이전 세션 결과를 베이스로 누적
  const sttBaseTextRef = useRef('');
  const sttBaseSegsRef = useRef<TranscriptSegment[]>([]);
  const recordStartAtRef = useRef(0);
  const sttOffsetMsRef = useRef(0);
  const sttActiveRef = useRef(false);
  // stop()이 마지막(isFinal) 결과를 기다리는 동안 쓰는 대기 해제 콜백 — 대기 중이 아니면 null.
  const sttStopWaiterRef = useRef<(() => void) | null>(null);
  // stop()이 그 대기창(최대 800ms) 동안에는 sttActiveRef가 여전히 true라, 그 사이 'end'가
  // 오면 기존 로직대로 STT를 재시작해버릴 수 있다 — stop() 중임을 별도로 표시해서 막는다.
  const sttStoppingRef = useRef(false);

  useSpeechRecognitionEvent('result', (e) => {
    if (!sttActiveRef.current) return;
    const text = e.results[0]?.transcript ?? '';
    const combined = sttBaseTextRef.current ? sttBaseTextRef.current.trimEnd() + ' ' + text : text;
    setLiveText(combined);
    liveTextRef.current = combined;
    // 세그먼트(단어별) 타임스탬프는 isFinal 결과에만 제대로 채워져 있다 — 중간(interim)
    // 결과는 세그먼트 자체는 와도 startTimeMillis/endTimeMillis가 전부 0으로 오는 경우가
    // 많아, 이걸 그대로 쓰면 단어별 재생·재생중 하이라이트가 전부 조용히 깨진다(실측 확인:
    // 저장된 세그먼트 19개 전부 0/0). 최종 결과가 올 때까지는 기존 세그먼트를 덮어쓰지 않는다.
    const segs = e.results[0]?.segments;
    if (e.isFinal && segs && segs.length) {
      liveSegmentsRef.current = [
        ...sttBaseSegsRef.current,
        ...segs.map((seg) => ({
          segment: seg.segment,
          startTimeMillis: seg.startTimeMillis + sttOffsetMsRef.current,
          endTimeMillis: seg.endTimeMillis + sttOffsetMsRef.current,
        })),
      ];
    }
    if (e.isFinal) sttStopWaiterRef.current?.();
  });

  // 오디오 캡처가 실제로 시작된 시점 — 이 이벤트 전에는 말해도 인식되지 않는다.
  useSpeechRecognitionEvent('audiostart', () => {
    if (!sttActiveRef.current) return;
    setSttReady(true);
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
    if (sttStoppingRef.current) return; // stop() 진행 중 — 재시작하지 않는다
    setTimeout(() => {
      if (!sttActiveRef.current || sttStoppingRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {}
    }, 200);
  });

  const startSTT = () => {
    sttActiveRef.current = true;
    // 초반 고정 지연을 없애고 즉시 시도 — 앞부분 발화 유실의 주 원인이었음.
    // 실패할 때만(엔진이 아직 준비 안 된 경우) 짧은 백오프로 재시도.
    const attempt = (n: number) => {
      if (!sttActiveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: 'ko-KR', interimResults: true, continuous: true });
        sttOffsetMsRef.current = Date.now() - recordStartAtRef.current;
      } catch {
        if (n < 4) setTimeout(() => attempt(n + 1), 120);
      }
    };
    attempt(0);
  };

  const start = async () => {
    setLiveText('');
    liveTextRef.current = '';
    liveSegmentsRef.current = [];
    sttBaseTextRef.current = '';
    sttBaseSegsRef.current = [];
    sttOffsetMsRef.current = 0;
    sttStopWaiterRef.current = null;
    sttStoppingRef.current = false;
    setSttReady(false);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    await recorder.prepareToRecordAsync();
    recordStartAtRef.current = Date.now();
    // STT를 오디오 레코더보다 먼저 요청해 "듣기 시작" 지연을 최소화한다.
    startSTT();
    recorder.record();
  };

  const cancel = async () => {
    sttStoppingRef.current = true;
    sttActiveRef.current = false;
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
    try { await recorder.stop(); } catch {}
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    setLiveText('');
    liveTextRef.current = '';
    setSttReady(false);
  };

  const stop = async (): Promise<VoiceCaptureResult> => {
    sttStoppingRef.current = true;
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    await recorder.stop();

    // stop()을 불러도 STT 엔진이 정확한 세그먼트 타임스탬프가 담긴 마지막(isFinal)
    // 결과를 비동기로 조금 늦게 보내준다. sttActiveRef를 여기서 바로 끄면 위 result
    // 핸들러가 그 결과를 무시해버리므로, 최대 800ms만 기다렸다가(isFinal이 오면 즉시,
    // 안 오면 타임아웃으로) 그 다음에 끈다.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 800);
      sttStopWaiterRef.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    sttStopWaiterRef.current = null;
    sttActiveRef.current = false;
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    const uri = recorder.uri;
    const transcript = liveTextRef.current.trim();
    const durationSec = Math.round((recorderState.durationMillis ?? 0) / 1000);
    const segments = [...liveSegmentsRef.current];
    setLiveText('');
    liveTextRef.current = '';
    setSttReady(false);
    return { uri: uri ?? null, transcript, durationSec, segments };
  };

  return { recorderState, liveText, sttReady, start, stop, cancel };
}
