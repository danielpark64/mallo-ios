// ─── 목록 공용 오디오 플레이어 ───────────────────────────────────────────────
// 카드마다 플레이어를 만들면 목록 크기만큼 네이티브 플레이어가 메모리에 올라가 배터리·메모리를 먹는다.
// 앱 전체에 하나만 두고, 카드는 "내 id가 재생 중인가"만 본다. 상세 화면(구간 재생)은 자기 플레이어를 따로 쓴다.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

type Ctx = {
  playingId: string | null;
  /** 같은 id면 일시정지/이어듣기, 다른 id면 그 파일을 처음부터 재생 */
  toggle: (id: string, uri: string) => void;
  stop: () => void;
};
const SharedPlayerContext = createContext<Ctx>({ playingId: null, toggle: () => {}, stop: () => {} });

export function SharedPlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const loadedRef = useRef<{ id: string; uri: string } | null>(null);
  const startedAtRef = useRef(0);

  const stop = useCallback(() => {
    try { player.pause(); } catch {}
    setPlayingId(null);
  }, [player]);

  const toggle = useCallback((id: string, uri: string) => {
    if (playingId === id) { stop(); return; }
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
    if (!playingId) return;
    if (Date.now() - startedAtRef.current < 300) return;
    const atEnd = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (status.didJustFinish || atEnd) setPlayingId(null);
  }, [status.didJustFinish, status.currentTime, status.duration, playingId]);

  // 앱이 뒤로 가면 멈춘다 (배터리·소리 사고 방지)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') stop(); });
    return () => sub.remove();
  }, [stop]);

  const value = useMemo(() => ({ playingId, toggle, stop }), [playingId, toggle, stop]);
  return <SharedPlayerContext.Provider value={value}>{children}</SharedPlayerContext.Provider>;
}

export function useSharedPlayer() {
  return useContext(SharedPlayerContext);
}
