# 교대알람 ↔ 세이람 일정 공유

같은 폰에 두 앱이 깔려 있으면 **사용자가 아무것도 하지 않아도** 서로의 달력에 보인다(2026-10-18 사용자 지시).

- 교대알람 근무(초번·말번·비번…) → 세이람 달력 칸에 작은 색 글씨
- 세이람 일정(이름·날짜·시각·기간) → 교대알람 달력
- **한쪽 앱 설정에서만 켜도** 공유된다. 기본은 꺼짐.
- 인터넷은 쓰지 않는다(세이람은 인터넷 권한이 없다). 서로 **읽기만** 하고 알람은 각자 자기 것만 울린다.

이 문서는 **교대알람 채팅에 그대로 붙여 넣는 작업 지시서**다. 세이람 쪽은 이미 구현돼 있다.

| | 방식 | 상태 |
|---|---|---|
| **v2 자동 공유 (Android)** | 각 앱이 우리 두 앱만 읽을 수 있는 ContentProvider를 연다 | 세이람 완료 · **교대알람 할 일** |
| v2 자동 공유 (iOS) | App Group 공용 보관함 | 유료 개발자 계정 활성화 후 두 앱 함께 |
| v1 링크로 가져오기 | 세이람 버튼 → 교대알람이 열려 보내기 → 세이람 | iOS 임시용(아래 부록). Android는 v2만 |

세이람 구현 위치: `modules/sayram-share/`(Android 창구·읽기), `lib/siblingShare.ts`(형식·판단, 테스트 `lib/__tests__/siblingShare.test.ts`), `lib/shiftImport.ts`(근무표 형식 검사 `parseShiftBody`), 설정 › 달력 › "교대알람과 일정 공유".

---

## v3 (2026-10-18) — 상대 앱을 깨우지 않기 ← 지금 기준

v2는 앱을 열 때마다 상대 창구를 query로 읽어 꺼져 있던 상대 앱 프로세스를 깨웠다(32 측정 약 28MB). v3는:
- 내 데이터가 **바뀌었을 때만**, 앱을 **떠날 때(background)** 상대 창구에 `call("push", 이름, {json})`로 한 번 넣어 준다. 지난번과 같으면(`t`만 다르면) 안 넣는다(`files/share/pushed/`).
- 앱을 **열 때**는 받은 파일(`files/share/inbox/`)만 읽는다 — 상대를 부르지 않는다.
- query(pull)는 받은 게 없을 때(처음)·상대 config에 `"push":1`이 없을 때(옛 버전)만, 실행당 1번. 넣기 실패 시 그 실행에선 다시 안 넣는다.
- config 형식: `{"share":bool,"push":1,"t":ms}`.
- 세이람 inbox가 받는 이름: `shifts`·`config` / 교대알람 inbox가 받는 이름: `events`·`config`.
- 설치 확인(`isInstalled`)은 앱 실행 때 한 번만.
- 교대알람 작업 지시서: `docs/alarmapp-task-v3-no-wake.md`. 아래 v2 설명의 형식(shifts·events)은 그대로 쓴다.

## v2 자동 공유 (Android)

### 창구 주소

| 주소 | 내용 | 여는 앱 | 읽는 앱 |
|---|---|---|---|
| `content://com.danielpark.alarmapp.share/shifts` | 근무표(아래 "근무표 형식") | 교대알람 | 세이람 |
| `content://com.danielpark.alarmapp.share/config` | `{"share":true|false,"t":ms}` 교대알람 쪽 공유 스위치 | 교대알람 | 세이람 |
| `content://com.danielpark.sayram.share/events` | 세이람 일정(아래 "일정 형식") | 세이람 | 교대알람 |
| `content://com.danielpark.sayram.share/config` | `{"share":true|false,"t":ms}` 세이람 쪽 공유 스위치 | 세이람 | 교대알람 |

- 응답은 열 하나(`json`)짜리 행 하나. 없거나 막히면 `null`(커서 없음).
- **호출 앱 확인 필수**: provider의 `query()`에서 `callingPackage`가 상대 앱(`com.danielpark.sayram` / `com.danielpark.alarmapp`)이 아니면 `null`. 두 앱은 Play 앱 서명 키가 달라 `signature` 권한은 못 쓴다.
- 읽는 쪽 매니페스트에 `<queries><package android:name="상대 패키지"/></queries>`(Android 11+ 패키지 가시성).
- **공유 여부 = 내 스위치 || 상대 config.share** (한쪽만 켜도). 꺼져 있으면 읽은 데이터를 표시하지 않고, 이미 받아 둔 것도 지운다.
  - **반드시 지킬 것**: 공유 여부가 거짓이면 상대 데이터를 절대 표시하지 않는다(세이람은 스위치와 상관없이 events를 창구에 둔다 — 보일지는 읽는 쪽 판단).
  - 읽은 내용이 직전과 같으면 다시 저장·그리지 않는다(앱이 앞으로 올 때마다 달력 전체를 다시 그리지 않게).
- 언제 쓰고 읽나: 쓰기는 데이터·스위치가 바뀔 때와 앱 시작 때, 읽기는 앱 시작과 앱이 앞으로 올 때(`AppState` active). **주기적 폴링 금지.**

### 근무표 형식 (`shifts`)

```json
{ "f": "2026-09-18", "l": ["초번","말번","비번"], "c": ["#4F8EF7","#F2994A","#9AA0A6"], "o": [0,0,1], "d": "0011220011-2...", "t": 1792300000000 }
```

| 키 | 뜻 |
|---|---|
| `f` | 첫날 `YYYY-MM-DD`(0 채움, 실제 있는 날짜) — 오늘 기준 31일 전 |
| `l` | 근무 종류 이름(최대 36개, 12자 이내, 사용자 언어로 번역된 표시 이름). 세이람 칸이 좁으니 **"초번 출근" 같은 알람 이름이 아니라 시간대 이름(SHIFTS label: 초번·말번·비번…)만** |
| `c` | 종류별 색 `#RRGGBB` |
| `o` | 종류별 쉬는 날 여부(1/0) |
| `d` | `f`부터 하루 한 글자: `l` 번호를 36진수 **소문자**(`0`~`9`,`a`~`z`), 근무 없는 날 `-`. 최대 800자(약 215일 = 앞 31일 + 뒤 183일) |
| `t` | 만든 시각(ms) |

세이람은 하나라도 틀리면(없는 날짜·형식 밖 글자·없는 번호·길이 초과) 통째로 무시한다.

### 일정 형식 (`events`, 세이람 → 교대알람)

```json
{ "v": 1, "t": 1792300000000, "e": [
  { "d": "2026-10-20", "h": 870, "n": "안전보건 교육" },
  { "d": "2026-10-22", "e": "2026-10-26", "n": "가족 휴가" }
] }
```
`d` 날짜, `e` 기간 일정의 끝나는 날(있을 때만), `h` 시각(그날 0시부터 분, 시간이 있을 때만), `n` 이름(일정 내용 첫 줄 30자 이내, 비어 있으면 `•`). 범위는 31일 전 ~ 1년 뒤, 최대 1000건. 녹음·말한 원문 등 다른 정보는 보내지 않는다.

### 교대알람에서 할 일

1. **로컬 모듈 하나 추가**(세이람 `modules/sayram-share/` 구조를 그대로 복사, 이름·패키지만 교대알람용으로):
   - `ShareProvider`(authority `${applicationId}.share` = `com.danielpark.alarmapp.share`, exported, `query()`에서 `callingPackage == "com.danielpark.sayram"`만 허용, 이름은 `shifts`·`config`만)
   - `ShareFiles`(앱 내부 `files/share/<이름>.json`, 임시 파일에 쓰고 rename)
   - 모듈 함수 `writeOwn(name, json)`(Function) / `readSibling(authority, name)`(**AsyncFunction** — 상대 앱 프로세스가 꺼져 있으면 띄울 때까지 기다리므로 JS 스레드를 막지 않게)
   - 매니페스트 `<queries><package android:name="com.danielpark.sayram"/></queries>`
2. **설정에 스위치** "세이람과 일정 공유"(기본 꺼짐) — 설명: "같은 폰의 세이람 일정이 달력에, 근무가 세이람 달력에 보여요. 한쪽 앱에서만 켜도 돼요."
3. **근무표 쓰기**: 알람·하루 근무 변경·언어가 바뀔 때, 앱 시작 때 `writeOwn('shifts', …)`, `writeOwn('config', {share, t})`.
   근무 계산은 위젯(`src/utils/widgetSync.ts` `weekSchedule`)과 **같은 규칙**(아래 참고 구현).
4. **세이람 일정 읽기·표시**: 시작·앞으로 올 때 `readSibling('com.danielpark.sayram.share','config')`·`('…','events')` → 공유가 켜져 있으면 달력 칸에 작게(근무 라벨과 구분되게). 알람은 만들지 않는다.
5. **테스트**: 근무표 만들기를 순수 함수로 빼서 `scripts/logic-tests`(초번·말번·비번 로테이션, 하루 근무 변경, 근무 없는 날 `-`, **평소 비번이 빠지지 않는지**). 정적 체크에 "provider가 세이람 패키지만 허용" 추가.

### 참고 구현: 근무표 만들기 (교대알람, TypeScript)

```ts
// src/utils/sayramShare.ts — 세이람과 공유할 근무표 (형식: 세이람 저장소 docs/shift-share-protocol.md)
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

export function buildShiftShare(alarms: Alarm[], overrides: DayOverrides, today: Date): string {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 31);
  const days = 215;
  const keyOf = new Map<string, number>();
  const l: string[] = []; const c: string[] = []; const o: number[] = [];
  const colorOf = shiftColorMap(alarms);
  let d = '';
  for (let i = 0; i < days; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const ds = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    // 위젯 weekSchedule과 같은 규칙: 하루 근무 변경이 먼저, 없으면 shiftForDate·isOffDay
    const ov = dayOverrideDisplay(overrides[ds]);
    const shift = ov ? null : shiftForDate(alarms, ds);
    const off = ov ? ov.isOff : isOffDay(alarms, ds);
    // 위젯 규칙에선 평소 쉬는 날 라벨이 ''이다 — 그대로 두면 비번이 세이람에 하나도 안 간다.
    let label = ov ? t(ov.label) : (shift ? shiftLabelFor(shift, ds) : '');   // shiftLabelFor는 widgetSync 안 지역 함수 → 공용으로 빼기
    if (!label && off) label = t('비번');                                    // 교대알람 달력이 쉬는 날을 부르는 실제 이름과 맞출 것
    if (!label) { d += '-'; continue; }
    const color = ov?.shift ? (SHIFTS.find((s) => s.id === ov.shift)?.color ?? '#a29bfe')
                            : (shift ? (colorOf[shift.id] ?? '#a29bfe') : '#9AA0A6');
    const key = `${label}|${color}|${off ? 1 : 0}`;
    if (!keyOf.has(key)) {
      if (l.length >= 36) { d += '-'; continue; }
      keyOf.set(key, l.length); l.push(label.slice(0, 12)); c.push(color); o.push(off ? 1 : 0);
    }
    d += B36[keyOf.get(key)!];
  }
  const f = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  return JSON.stringify({ f, l, c, o, d, t: Date.now() });
}
```

### 짝 맞추기 예시
`{"f":"2026-10-18","l":["초번","말번","비번"],"c":["#4F8EF7","#F2994A","#9AA0A6"],"o":[0,0,1],"d":"001122-0","t":1}`
→ 세이람: 10/18 초번, 10/20 말번, 10/22 비번(쉬는 날), 10/24 근무 없음, 10/25 초번.

### 확인 방법(32·노트)
1. 두 앱 설치, 한쪽 설정만 켠다 → 세이람 달력에 근무 라벨, 교대알람 달력에 세이람 일정.
2. 교대알람에서 하루 근무를 바꾼 뒤 세이람으로 전환 → 바뀐 근무가 보인다.
3. 양쪽 다 끄면 → 세이람에서 근무 라벨이 사라진다.
4. `adb shell content query --uri content://com.danielpark.alarmapp.share/shifts` → shell은 허용 목록에 없으므로 **아무것도 나오지 않아야** 정상(다른 앱 차단 확인).

---

## iOS 자동 공유 (2026-10-19~, App Group)
- 두 앱 모두 entitlements에 `com.apple.security.application-groups = ["group.com.danielpark.shared"]`(애플 개발자 사이트에서 App Group 등록 + 각 App ID에 연결 완료).
- 공유 폴더 안 **앱별 하위 폴더**: `<그룹>/sayram/events.json`·`config.json`(세이람이 씀) / `<그룹>/alarmapp/shifts.json`·`config.json`(교대알람이 씀). 내용 형식은 Android와 같다(config는 `{"share":bool,"push":1,"t":ms}`).
- iOS는 파일을 읽어도 상대 앱이 실행되지 않으므로 넣어 주기(push)가 필요 없다. 열 때 상대 폴더 파일을 바로 읽는다. 쓰기는 `.atomic`.
- 설치 확인: 상대 URL scheme을 열 수 있는지(`canOpenURL`) — 세이람은 `alarmapp://`(Info.plist `LSApplicationQueriesSchemes`에 `alarmapp`), 교대알람은 `mallo://`(세이람 scheme, `LSApplicationQueriesSchemes`에 `mallo`). 실행당 1번, 메인 스레드 대기는 최대 0.3초.
- 세이람 구현: `modules/sayram-share/ios/SayramShareModule.swift`(JS 함수 이름은 Android와 같음).

## 부록: v1 링크로 가져오기 (iOS 임시용)
세이람 → `alarmapp://share-shifts?v=1&return=mallo` → 교대알람 "세이람에 근무표를 보낼까요?" → `mallo://import-shifts?v=1&p=<encodeURIComponent(위 근무표 JSON)>`.
세이람은 사용자가 [가져오기]를 누르고 10분 안에 돌아온 것만 바로 받고, 아니면 "바꿀까요?"를 묻는다. 저장된 것보다 `t`가 오래되면 무시. iOS 자동 공유가 생겨 새로 쓰지 않는다(세이람의 받기 코드는 옛 교대알람 대비로 남겨 둠).
