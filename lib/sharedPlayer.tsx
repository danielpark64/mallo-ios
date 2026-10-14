// ─── 목록 공용 오디오 플레이어 ───────────────────────────────────────────────
// 카드마다 플레이어를 만들면 목록 크기만큼 네이티브 플레이어가 메모리에 올라가 배터리·메모리를 먹는다.
// 앱 전체에 하나만 두고, 카드는 "내 id가 재생 중인가"만 본다. 상세 화면(구간 재생)은 자기 플레이어를 따로 쓴다.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { clampSpeech, speechLanguage } from './speech';

type Ctx = {
  playingId: string | null;
  /** 같은 id면 일시정지/이어듣기, 다른 id면 그 파일을 처음부터 재생 */
  toggle: (id: string, uri: string) => void;
  stop: () => void;
  /** 녹음이 없는 일정: 글을 폰 음성으로 읽어 준다. 같은 id면 멈춤 */
  speak: (id: string, text: string) => void;
};
const SharedPlayerContext = createContext<Ctx>({ playingId: null, toggle: () => {}, stop: () => {}, speak: () => {} });

export function SharedPlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const loadedRef = useRef<{ id: string; uri: string } | null>(null);
  const startedAtRef = useRef(0);
  // 마지막으로 재생한 녹음이 끝까지 갔는지 (상태 값보다 먼저 확정된다)
  const endedRef = useRef(false);
  // 재생 요청 번호 — 되감는 사이 멈춤·다른 재생이 오면 늦게 도착한 play()를 버린다
  const reqRef = useRef(0);

  // 지금 읽어 주는 중인 id (녹음 재생과 같은 playingId를 쓰되, 끝 판정은 음성 콜백으로 한다)
  const speakingIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    reqRef.current++;
    try { player.pause(); } catch {}
    if (speakingIdRef.current) { speakingIdRef.current = null; try { Speech.stop(); } catch {} }
    setPlayingId(null);
  }, [player]);

  const speak = useCallback((id: string, text: string) => {
    if (playingId === id) { stop(); return; }
    reqRef.current++;
    try { player.pause(); } catch {}
    try { Speech.stop(); } catch {}
    if (!text.trim()) return;
    speakingIdRef.current = id;
    const finish = () => {
      if (speakingIdRef.current !== id) return; // 다른 것을 시작하며 멈춘 경우
      speakingIdRef.current = null;
      setPlayingId((cur) => (cur === id ? null : cur));
    };
    try {
      Speech.speak(clampSpeech(text), { language: speechLanguage(), onDone: finish, onStopped: finish, onError: finish });
      setPlayingId(id);
    } catch { finish(); }
  }, [player, playingId, stop]);

  const toggle = useCallback((id: string, uri: string) => {
    if (playingId === id) { stop(); return; }
    if (speakingIdRef.current) { speakingIdRef.current = null; try { Speech.stop(); } catch {} }
    const req = ++reqRef.current;
    const loaded = loadedRef.current;
    // 끝까지 들은 뒤인지: 상태 값은 최대 250ms 늦으므로 우리가 기억한 "끝남"도 함께 본다
    const finished = endedRef.current || (status.duration > 0 && status.currentTime >= status.duration - 0.1);
    startedAtRef.current = Date.now();
    setPlayingId(id);
    if (!loaded || loaded.id !== id || loaded.uri !== uri) {
      try { player.replace(uri); } catch {}
      loadedRef.current = { id, uri };
      endedRef.current = false;
      try { player.play(); } catch {}
      return;
    }
    // 같은 녹음을 다시 듣기: 끝 지점이면 처음으로 되감기가 **끝난 뒤** 재생한다.
    // (기다리지 않으면 iOS에서 끝 지점에서 재생이 시작돼 곧바로 멈춰, "되다 안 되다"를 반복했다 — 2026-10-14 폰)
    if (finished || status.currentTime <= 0) {
      endedRef.current = false;
      Promise.resolve()
        .then(() => player.seekTo(0))
        .catch(() => {})
        .then(() => {
          if (reqRef.current !== req) return; // 그 사이 멈추거나 다른 것을 재생했다
          startedAtRef.current = Date.now();
          try { player.play(); } catch {}
        });
      return;
    }
    try { player.play(); } catch {}
  }, [player, playingId, status.currentTime, status.duration, stop]);

  // 끝나면 ▶로 복귀 (시작 직후 이전 상태값 오판 방지)
  useEffect(() => {
    if (!playingId || speakingIdRef.current) return;
    if (Date.now() - startedAtRef.current < 300) return;
    const atEnd = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    // 끝 지점 값만 보고 끊으면, 되감기 직후 아직 갱신 안 된 값에 속아 재생 중인데 ▶로 돌아간다 → 멈춘 상태일 때만
    if (status.didJustFinish || (atEnd && !status.playing)) {
      endedRef.current = true;
      setPlayingId(null);
    }
  }, [status.didJustFinish, status.currentTime, status.duration, status.playing, playingId]);

  // 앱이 뒤로 가면 멈춘다 (배터리·소리 사고 방지)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') stop(); });
    return () => sub.remove();
  }, [stop]);

  const value = useMemo(() => ({ playingId, toggle, stop, speak }), [playingId, toggle, stop, speak]);
  return <SharedPlayerContext.Provider value={value}>{children}</SharedPlayerContext.Provider>;
}

export function useSharedPlayer() {
  return useContext(SharedPlayerContext);
}
