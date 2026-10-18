# 교대알람 작업 지시서 — 공유 v3 "상대 앱을 깨우지 않기" + 배너 설치 확인은 실행 때 한 번만

(세이람 쪽은 2026-10-18 완료. 교대알람 채팅에 붙여 넣어 실행. 앞의 지시서 `alarmapp-task-promo-privacy.md` 작업 위에 이어서 하면 된다)

---

교대알람(~/Desktop/daniel-project/AlarmApp)에 아래 두 가지를 해 줘. **사용자 지시: "시스템에 부하는 절대로 주면 안 돼."**

## 왜 바꾸나 (32에서 측정)

지금(v2)은 앱이 열릴 때마다(시작·앞으로 올 때) 상대 앱 창구를 `query`로 읽는다. 상대 앱이 꺼져 있으면 **Android가 상대 앱 프로세스를 새로 띄운다**(32 측정: 세이람을 열 때마다 교대알람 프로세스가 떠서 메모리 약 28MB). 교대알람을 열 때도 세이람이 똑같이 깬다. 앱을 열 때마다 상대를 깨우는 건 쓸데없는 부하.

## 1. 공유 v3: 바뀔 때만 넣어 주고, 열 때는 받은 파일만 읽는다

세이람은 이미 이렇게 바뀌었다(세이람 저장소 `modules/sayram-share/android/.../SayramShareModule.kt`, `ShareFiles.kt`, `ShareProvider.kt`, `lib/siblingShare.ts`가 참고 구현. 그대로 옮기되 이름만 바꾸면 된다).

**규칙**
- 내 데이터(교대알람: `shifts`·`config`)가 **바뀌었을 때만**, 앱을 **떠날 때(AppState `background`)** 상대 창구에 한 번 넣어 준다(push). 지난번에 넣어 준 내용과 같으면(만든 시각 `t`만 다르면) 상대를 건드리지 않는다.
- 앱을 **열 때**(시작·`active`)는 상대가 넣어 준 파일(inbox)만 읽는다. 상대 앱을 부르지 않는다.
- 직접 가져오기(pull, 지금의 query)는 **받은 게 아직 없을 때(처음)**와 **상대가 옛 버전일 때만**, 그것도 **실행당 1번**.
- 넣기가 실패하면(상대가 옛 버전이라 받는 창구가 없음) 이번 실행에는 다시 시도하지 않는다.
- 내 `config`에 `"push":1`을 넣는다 → 상대가 "이 앱은 바뀔 때 넣어 주는 v3"라고 알고 직접 가져오지 않는다. 형식: `{"share":true|false,"push":1,"t":ms}`.

**파일 자리 (`ShareFiles.kt`)** — 앱 내부 `files/share/`
- `<이름>.json` — 내가 내놓는 것: 교대알람은 `shifts`·`config` (지금 그대로, query용으로 유지)
- `inbox/<이름>.json` — 세이람이 넣어 준 것: **`events`·`config`**만 받는다(INBOX_NAMES), 크기 256KB 이하
- `pushed/<이름>.json` — 마지막으로 세이람에 넣어 준 내용(`t` 뺀 본문). 같으면 다시 안 넣는다
- 쓰기는 임시 파일에 쓰고 바꿔치기(atomic)

**창구 (`ShareProvider.kt`)** — 기존 `query`는 그대로 두고 `call` 추가
```kotlin
override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
  val caller = callingPackage ?: return null
  if (caller !in ALLOWED) return null            // com.danielpark.sayram 만
  val ctx = context ?: return null
  if (method != "push" || arg == null) return null
  val json = extras?.getString("json") ?: return null
  val ok = ShareFiles.writeInbox(ctx, arg, json)  // INBOX_NAMES(events·config)·크기 검사
  return Bundle().apply { putBoolean("ok", ok) }
}
```

**네이티브 모듈 (`AlarmappShareModule.kt`)** — 함수 4개(세이람과 같은 이름·동작)
- `writeOwn(name, json)` — 그대로
- `readInbox(name)` — Function(동기), inbox 파일 내용 또는 null. 상대 앱을 부르지 않는다
- `pushToSibling(authority, name)` — AsyncFunction. 내 파일을 읽어 `"t":숫자` 를 뺀 본문이 `pushed/<name>.json`과 같으면 `"same"`(아무것도 안 함). 다르면 `contentResolver.call(Uri.parse("content://$authority"), "push", name, Bundle{json})` → 결과 `ok`면 pushed 파일 갱신 후 `"pushed"`, 아니면/예외면 `"fail"`. authority는 `^com\.danielpark\.[a-z]+\.share$`만, name은 내가 내놓는 이름(`shifts`·`config`)만.
- `pullToInbox(authority, name)` — AsyncFunction. 지금의 readSibling(query)과 같되 읽은 내용을 inbox에 저장하고 돌려준다. name은 INBOX_NAMES만.
- `isInstalled(pkg)` — 이미 있음, 그대로

**JS (`src/utils/sayramShareNative.ts`, `src/hooks/useSayramShare.tsx`)**
- `sayramInstalled()` — **실행 때 한 번만** 네이티브를 부르고 결과를 변수에 기억(아래 2번).
- `publishOwnShare` — 그대로(내 파일만 갱신). 단 config에 `push: 1` 추가.
- 읽기(`readSiblingEvents`·`readSiblingShareOn`): 세이람이 없으면(`sayramInstalled()` false) 바로 null. 아니면
  ```ts
  if (needsPull(native.readInbox('config'), pulledThisRun)) {   // 처음이거나 상대가 옛 버전(push 표시 없음)
    pulledThisRun = true;
    await native.pullToInbox(SAYRAM, 'config');
    await native.pullToInbox(SAYRAM, 'events');
  }
  // 그다음은 native.readInbox('config') / native.readInbox('events') 만 읽는다
  ```
  `needsPull(raw, pulled)`: pulled면 false, raw 없으면 true, `JSON.parse(raw).push !== 1`이면 true(깨진 JSON도 true). 순수 함수로 두고 로직 테스트 추가.
- 넣기: AppState가 `background`가 될 때 `pushOwnShare(mine)` —
  ```ts
  let pushFailedThisRun = false;
  async function pushOwnShare(mine: boolean) {
    if (!native || !sayramInstalled() || pushFailedThisRun) return;
    if ((await native.pushToSibling(SAYRAM, 'config')) === 'fail') { pushFailedThisRun = true; return; }
    const cfg = parseShareConfig(native.readInbox('config'));
    if (shareEnabled(mine, cfg) && (await native.pushToSibling(SAYRAM, 'shifts')) === 'fail') pushFailedThisRun = true;
  }
  ```
  설정(config)은 늘 넣고, 근무표(shifts)는 공유가 켜져 있을 때만 넣는다.
- 폴링·타이머는 만들지 않는다. 열 때(`active`) 읽기는 이제 파일 읽기뿐이라 가볍다.

## 2. 홍보 배너: 세이람 설치 확인은 실행 때 한 번만

지금 `PromoBanner.tsx`는 `AppState active`마다 `setActive(n => n + 1)` → `useMemo(() => sayramInstalled(), [active])`로 앱이 앞으로 올 때마다 다시 확인한다. **사용자 지시: 배너가 돌 때마다·앞으로 올 때마다 확인하지 말고, 앱 실행 때 한 번만.**
- `sayramInstalled()` 안에서 결과를 모듈 변수에 기억(`let installedCache: boolean | null = null`)하고, 처음 한 번만 `native.isInstalled('com.danielpark.sayram')`를 부른다.
- PromoBanner의 `active` 카운터와 그 AppState 리스너는 설치 확인용이면 지운다(슬라이드 자동 넘김용 active가 따로 있으면 그건 둔다). `useMemo(() => makeSlides(..., sayramInstalled()), [lang])`.
- 세이람을 새로 깔거나 지운 건 다음 실행 때 반영되면 된다.

## 3. 확인 (32 — 교대알람·세이람 둘 다 깔림)

세이람 쪽에서 한 측정과 같은 방법:
```bash
S=RF9R3049REV; A=com.danielpark.sayram
adb -s $S shell am force-stop $A
# 교대알람을 열고 닫기를 3번 — 매번 아래가 비어 있어야(세이람이 안 깨야) 정상
adb -s $S shell pidof $A
```
- 교대알람 첫 실행(받은 게 없음)에서만 세이람이 한 번 깨는 건 정상(처음 한 번 가져오기).
- 그 뒤 교대알람을 열고 닫아도 세이람 프로세스가 생기지 않아야 한다.
- 교대알람에서 근무를 바꾸고 홈으로 나간 뒤 세이람을 열면 바뀐 근무가 보여야 한다(떠날 때 넣어 주기).
- 세이람에서 일정을 추가하고 홈으로 나간 뒤 교대알람을 열면 그 일정이 보여야 한다.
- 배너: 세이람이 깔려 있으니 세이람 소개 없이 돈다.

verify-fix·알람 테스트 스위트는 평소처럼. 커밋·푸시 전에 물어보기.
