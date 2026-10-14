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

  // 지금 읽어 주는 중인 id (녹음 재생과 같은 playingId를 쓰되, 끝 판정은 음성 콜백으로 한다)
  const speakingIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    try { player.pause(); } catch {}
    if (speakingIdRef.current) { speakingIdRef.current = null; try { Speech.stop(); } catch {} }
    setPlayingId(null);
  }, [player]);

  const speak = useCallback((id: string, text: string) => {
    if (playingId === id) { stop(); return; }
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
    const loaded = loadedRef.current;
    const finished = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (!loaded || loaded.id !== id || loaded.uri !== uri) {
      try { player.replace(uri); } catch {}
      loadedRef.current = { id, uri };
    } else if (finished || status.currentTime <= 0) {
      try { player.seekTo(0); } catch {}
    }
    startedAtRef.current = Date.now();
    try { player.play(); } catch {}
    setPlayingId(id);
  }, [player, playingId, status.currentTime, status.duration, stop]);

  // 끝나면 ▶로 복귀 (시작 직후 이전 상태값 오판 방지)
  useEffect(() => {
    if (!playingId || speakingIdRef.current) return;
    if (Date.now() - startedAtRef.current < 300) return;
    const atEnd = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (status.didJustFinish || atEnd) setPlayingId(null);
  }, [status.didJustFinish, status.currentTime, status.duration, playingId]);

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
