// 알람 소리 고르기(1.2.0): 소리 해석(일정별 → 설정 기본), 채널 id 규칙, 파일 이름, 목록
import {
  SOUND_IDS, TONE_IDS, androidChannelId, androidSoundFile, getDefaultAlarmSound, iosSoundFile, isSoundId,
  previewName, recordSoundChoices, resolveAlarmSound, setDefaultAlarmSound,
} from '../alarmSounds';
// 노드 타입 없이 파일을 본다(jest는 저장소 폴더에서 돈다)
const { existsSync, statSync, readFileSync } = require('fs');
const { join, resolve } = require('path');
const ROOT: string = resolve('.');

afterEach(() => setDefaultAlarmSound('default'));

describe('resolveAlarmSound', () => {
  test('일정에 고른 소리가 있으면 그것, 없으면 설정 기본, 설정도 없으면 기본음', () => {
    expect(resolveAlarmSound(undefined)).toBe('default');
    setDefaultAlarmSound('marimba');
    expect(resolveAlarmSound(undefined)).toBe('marimba');
    expect(resolveAlarmSound(null)).toBe('marimba');
    expect(resolveAlarmSound('old_clock')).toBe('old_clock');
    // 설정이 다른 소리여도 일정이 '세이람 기본음'을 따로 골랐으면 그대로
    expect(resolveAlarmSound('default')).toBe('default');
  });
  test('모르는 값(옛 백업·다른 판)은 무시하고 기본을 따른다', () => {
    setDefaultAlarmSound('bell_march');
    expect(resolveAlarmSound('rock_song')).toBe('bell_march');
    setDefaultAlarmSound('nope');
    expect(getDefaultAlarmSound()).toBe('default');
    expect(isSoundId('gentle_piano')).toBe(true);
    expect(isSoundId('')).toBe(false);
  });
});

describe('Android 채널 id 규칙', () => {
  test('기본 소리는 예전 채널 그대로, 고른 소리는 모드_소리, 진동만은 하나', () => {
    expect(androidChannelId('both', 'default')).toBe('alarm_both');
    expect(androidChannelId('sound', 'default')).toBe('alarm_sound');
    expect(androidChannelId('vibe', 'default')).toBe('alarm_vibe');
    expect(androidChannelId('both', 'marimba')).toBe('alarm_both_marimba');
    expect(androidChannelId('sound', 'music_box')).toBe('alarm_sound_music_box');
    expect(androidChannelId('vibe', 'marimba')).toBe('alarm_vibe');
    // 모드 × 소리 채널 id가 모두 다르다
    const ids = (['both', 'sound'] as const).flatMap((m) => SOUND_IDS.map((s) => androidChannelId(m, s)));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('소리 파일', () => {
  test('파일 이름 규칙', () => {
    expect(iosSoundFile('default')).toBe('alarm_long.wav');
    expect(iosSoundFile('digital_beep')).toBe('snd_digital_beep.caf');
    expect(androidSoundFile('default')).toBe('alarm_long.wav');
    expect(androidSoundFile('digital_beep')).toBe('snd_digital_beep.m4a');
    expect(previewName('default', 'android')).toBe('alarm_long');
    expect(previewName('marimba', 'android')).toBe('snd_marimba');
    expect(previewName('marimba', 'ios')).toBe('snd_marimba.caf');
  });
  test('6개 소리 파일이 iOS·Android 모두 들어 있고 1MB 이하다', () => {
    const root = ROOT;
    for (const id of TONE_IDS) {
      const caf = join(root, 'assets', 'sounds', iosSoundFile(id));
      const m4a = join(root, 'modules', 'mallo-alarm', 'android', 'src', 'main', 'res', 'raw', androidSoundFile(id));
      expect(existsSync(caf)).toBe(true);
      expect(existsSync(m4a)).toBe(true);
      expect(statSync(caf).size).toBeLessThan(1_000_000);
      expect(statSync(m4a).size).toBeLessThan(1_000_000);
    }
  });
  test('네이티브 표(AlarmTones.kt)와 app.json 플러그인 목록이 JS 표와 같다', () => {
    const root = ROOT;
    const kt = readFileSync(join(root, 'modules/mallo-alarm/android/src/main/java/com/danielpark/mallo/alarm/AlarmTones.kt'), 'utf8');
    const app = readFileSync(join(root, 'app.json'), 'utf8');
    for (const id of TONE_IDS) {
      expect(kt).toContain(`"${id}" -> R.raw.snd_${id}`);
      expect(app).toContain(`./assets/sounds/snd_${id}.caf`);
    }
  });
});

test('일정 소리 목록: 설정이 기본음이면 6개, 아니면 기본음도 고를 수 있게', () => {
  expect(recordSoundChoices('default')).toEqual([...TONE_IDS]);
  expect(recordSoundChoices('marimba')).toEqual(['default', ...TONE_IDS]);
});
