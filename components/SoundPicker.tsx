// ─── 알람 소리 고르기 목록 (일정 화면 알림 팝업 · 설정의 기본 알람 소리) ─────────────────────
// 줄을 누르면 고르면서 3초 들려준다. 같은 줄을 다시 누르면 멈추고, 목록이 닫히면(완료·취소·뒤로가기) 멈춘다.
// 미리듣기는 expo-audio(미디어 음량) — 앱에 든 소리 파일을 그대로 튼다(복사본을 만들지 않는다).
// 이 목록은 열 때만 그려진다 — 닫혀 있을 때 플레이어를 붙잡아 두지 않게.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Text } from './AppText';
import { useTheme, type Palette } from '../lib/theme';
import { useT } from '../lib/i18n';
import { SOUND_LABEL, previewName, type SoundId } from '../lib/alarmSounds';
import { useSharedPlayer } from '../lib/sharedPlayer';

/** 'follow' = 일정 목록의 "기본(설정을 따름)" 줄 */
export type SoundChoice = SoundId | 'follow';

const PREVIEW_MS = 3000;

function previewSource(id: SoundId): { uri: string } {
  const name = previewName(id, Platform.OS);
  // Android: res/raw 이름(expo-audio가 scheme 없는 이름을 raw 리소스로 찾는다) / iOS: 앱 번들 안 파일
  if (Platform.OS === 'android') return { uri: name };
  return { uri: new File(Paths.bundle, name).uri };
}

/** 3초 미리듣기. playing = 지금 들리는 줄 */
function useSoundPreview() {
  const player = useAudioPlayer(null);
  const [playing, setPlaying] = useState<SoundChoice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const stop = () => {
    clear();
    try { player.pause(); } catch {}
    setPlaying(null);
  };
  const play = (row: SoundChoice, id: SoundId) => {
    clear();
    try {
      player.replace(previewSource(id));
      player.seekTo(0);
      player.play();
    } catch (e) {
      console.warn('알람 소리 미리듣기 실패:', e);
      setPlaying(null);
      return;
    }
    setPlaying(row);
    // 한 번만 도는 3초 타이머(목록이 열려 있는 동안만) — 반복 타이머·폴링이 아니다
    timer.current = setTimeout(() => { timer.current = null; try { player.pause(); } catch {} setPlaying(null); }, PREVIEW_MS);
  };
  // 목록이 닫히면 멈춘다(플레이어 자체는 useAudioPlayer가 화면을 떠날 때 놓는다)
  useEffect(() => () => { clear(); try { player.pause(); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { playing, play, stop };
}

export function SoundList({ choices, value, onChange, followSound, hint }: {
  choices: SoundChoice[];
  value: SoundChoice;
  onChange: (v: SoundChoice) => void;
  /** 'follow' 줄이 실제로 울릴 소리(설정의 기본 소리) */
  followSound: SoundId;
  hint?: string;
}) {
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { t } = useT();
  const preview = useSoundPreview();
  const shared = useSharedPlayer();
  const press = (row: SoundChoice) => {
    onChange(row);
    if (preview.playing === row) { preview.stop(); return; }
    shared.stop(); // 듣던 녹음과 섞이지 않게
    preview.play(row, row === 'follow' ? followSound : row);
  };
  return (
    <View>
      {choices.map((row) => {
        const on = value === row;
        const isPlaying = preview.playing === row;
        const label = row === 'follow'
          ? `${t('기본')} (${t('설정: {name}', { name: t(SOUND_LABEL[followSound]) })})`
          : t(SOUND_LABEL[row]);
        return (
          <TouchableOpacity
            key={row}
            style={[s.row, on && s.rowOn]}
            onPress={() => press(row)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            testID={`sound-${row}`}
          >
            <Text style={[s.rowText, on && s.rowTextOn]} numberOfLines={2}>{label}</Text>
            <Text style={s.mark}>{`${on ? '✓ ' : ''}${isPlaying ? '■' : '▶'}`}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={s.hint}>{hint ?? t('줄을 누르면 고르면서 3초 들려줘요(무음 모드면 안 들려요).')}</Text>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface,
  },
  rowOn: { borderColor: C.accent },
  rowText: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },
  rowTextOn: { color: C.accent, fontWeight: '700' },
  mark: { color: C.accent, fontSize: 13, fontWeight: '800' },
  hint: { color: C.textSub, fontSize: 12, marginTop: 4 },
});
