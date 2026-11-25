// 새 버전 안내(1.2.3) — 앱을 열 때 뒤에서 스토어 판을 확인하고, 새 판이 있으면 "새 버전이 있어요" 창을 띄운다.
// 교대알람 src/hooks/useAppUpdatePrompt.ts(1.6.3)를 가져왔다. 바꾼 것: [나중에] 저장은 세이람 설정 파일(lib/prefs.ts),
// 네이티브 울림 확인은 lib/nativeAlarm.ts nativeRingingRecordId(), 앞으로 올 때(AppState) 날이 바뀌었으면 한 번 더 확인.
// 규칙(본부/규칙/업데이트-안내.md):
//  - 울리는 중·울림 화면에서는 절대 안 띄운다 — JS 울림 상태(ringing) + Android 네이티브 울림을 띄우기 직전·앞으로 올 때마다 본다.
//  - 시작 안내 창(권한 창 → 알람 화면 허용 안내)과 다른 창이 다 끝난 뒤(ready)에만.
//  - 확인은 앱 시작을 기다리게 하지 않는다(뒤에서, 실패는 조용히). [나중에]를 누른 날은 다시 안 묻는다.
//  - 타이머·폴링 없음: 시작 때 한 번 + 앱이 앞으로 올 때 날이 바뀌었으면 한 번(하루 한 번 수준).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { dayKey, shouldShowUpdate, type UpdateInfo } from './appUpdate';
import { checkForUpdate } from './appUpdateNative';
import { nativeRingingRecordId } from './nativeAlarm';
import { loadPrefs, savePrefs } from './prefs';
import { openStore } from './storeLink';

const START_DELAY_MS = 2000; // 시작 직후 할 일(알람 재등록 등)과 겹치지 않게 조금 뒤에(한 번만)

export function useAppUpdatePrompt(o: { loaded: boolean; ready: boolean; ringing?: boolean }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [laterDay, setLaterDay] = useState<string | null | undefined>(undefined); // undefined = 아직 못 읽음
  const [closed, setClosed] = useState(false);       // 이번 실행(오늘)에서 닫음
  const [nativeOk, setNativeOk] = useState(false);   // 띄우기 직전 네이티브 울림 확인을 통과
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [activeTick, setActiveTick] = useState(0); // 앞으로 올 때마다 +1 — 울림 확인을 다시 돌린다
  const started = useRef(false);
  const checkedDay = useRef<string | null>(null);
  const previewing = useRef(false); // 미리보기 중이면 실제 확인 결과(null)가 덮어쓰지 않게

  const runCheck = useCallback(() => {
    checkedDay.current = dayKey(new Date());
    checkForUpdate().then((v) => { if (!previewing.current) setInfo(v); }).catch(() => null);
  }, []);

  // 뒤에서 확인 — await로 시작을 붙잡지 않는다
  useEffect(() => {
    if (!o.loaded || started.current) return;
    started.current = true;
    try { setLaterDay(loadPrefs().updateLaterDay || null); } catch { setLaterDay(null); }
    const timer = setTimeout(runCheck, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [o.loaded, runCheck]);

  // 앱이 앞으로 올 때: 울림을 다시 보게 하고(울림 화면에서 돌아온 경우 등), 날이 바뀌었으면 한 번 더 확인한다
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      // 지금 울리는 중일 때만 내린다(떠 있는 창이 앞으로 올 때마다 깜빡이지 않게). 다시 확인은 activeTick으로
      if (nativeRingingRecordId()) setNativeOk(false);
      setActiveTick((n) => n + 1);
      const d = dayKey(new Date());
      setToday(d);
      if (started.current && checkedDay.current !== d) { setClosed(false); runCheck(); }
    });
    return () => sub.remove();
  }, [runCheck]);

  const ringing = !!o.ringing;
  const want = !closed && o.ready && laterDay !== undefined
    && shouldShowUpdate({ info, laterDay: laterDay ?? null, today, ringing });

  // 띄우기 직전: Android 네이티브(AlarmService)가 울리는 중이면 안 띄운다(iOS·모듈 없음은 늘 null)
  useEffect(() => {
    if (!want || nativeOk) return;
    if (!nativeRingingRecordId()) setNativeOk(true);
  }, [want, nativeOk, activeTick]);

  const onUpdate = useCallback(() => {
    openStore();
    if (!info?.required) setClosed(true);
  }, [info]);

  const onLater = useCallback(() => {
    setClosed(true);
    const d = dayKey(new Date());
    setLaterDay(d);
    savePrefs({ updateLaterDay: d });
  }, []);

  /** 미리보기(딥링크 mallo://update-preview, 출시 빌드에서도 열린다 — 창만 띄우고 [업데이트]는 스토어를 열 뿐이라 해가 없다).
   *  스토어 확인 없이 창만 띄운다. 시작 창 순서·울림 검사는 그대로 */
  const preview = useCallback(() => {
    previewing.current = true;
    setClosed(false); setLaterDay(null); setInfo({ storeVersion: 'preview', required: false });
  }, []);

  return { visible: want && nativeOk && !ringing, required: !!info?.required, onUpdate, onLater, preview };
}
