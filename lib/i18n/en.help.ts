// 영어 사전 — help 그룹 (키 = 한국어 원문)
// lib/helpContent.ts 의 제목·문단 전체. HelpSheet가 t(sec.title)·t(p)로 찾는다.
// 한국어 말하기 예시는 영어권 사용자용 예시("tomorrow at 3pm" 등)로 바꿨다.
export const EN_HELP: Record<string, string> = {
  '워치: 폰에 알람이 오면 연결된 워치에도 함께 표시됩니다. 워치에서 "알람 끄기"를 누르거나 알림을 닫으면 폰의 알람도 꺼지고 남은 재알림이 취소됩니다.': 'Watch: when an alarm arrives on your phone it also shows on a connected watch. Tap "Stop alarm" on the watch or dismiss the notification and the phone alarm stops and the remaining repeats are cancelled.',
  '접는 폰(플립)과 다른 앱 사용 중: 설정 › 알람 › "알람 화면 항상 띄우기"를 켜 두면, 폰을 접은 상태의 커버 화면이나 다른 앱을 쓰는 중에도 알람 끄기 화면이 뜹니다(Android).': 'Foldables and while using other apps: turn on Settings › Alarm › "Always show the alarm screen" so the alarm screen appears on the cover screen of a folded phone or while you use another app (Android).',
  '지난 일정은 "지난 일정 N건 보기"로 접혀 있어 지금부터의 일정이 맨 위에 옵니다. 누르면 펼쳐지고, 전체 일정 화면에서 검색·기간 조건을 쓰면 접지 않습니다.': 'Past schedules are folded under "Show N past" so upcoming ones stay on top. Tap to expand; with a search or period filter on All Schedules, nothing is folded.',
  '세이람은 말로 적는 일정 · 알람 앱입니다. 마이크를 누르고 말하면 날짜와 시간을 알아듣고 일정으로 저장합니다.':
    'SayRam is a schedule and alarm app you talk to. Tap the mic and speak; it picks out the date and time and saves a schedule.',

  // 1
  '1. 시작하기': '1. Getting started',
  '아래 가운데 마이크 버튼을 누르고 말한 뒤 "완료"를 누르면 끝입니다. 말한 내용이 글로 바뀌고, 그 안의 날짜·시간을 읽어 일정으로 저장합니다.':
    'Tap the mic button at the bottom, speak, then tap "Done". Your words are turned into text, the date and time are read from it, and it is saved as a schedule.',
  '예: "내일 오후 세 시에 치과 예약", "금요일 저녁 일곱 시 친구들과 저녁", "3일 후 오전 열 시 팀 회의"':
    'Examples: "Dentist appointment tomorrow at 3pm", "Dinner with friends next Friday at 7", "Team meeting in 3 days at 10am"',
  '말하는 동안 화면에 인식된 글과 "✓ 10월 10일 (토) 오후 3:00"처럼 알아들은 시점이 바로 보입니다. "⏳ 날짜·시간을 기다리는 중…"이 보이면 날짜나 시간을 덧붙여 말하면 됩니다.':
    'While you speak, the recognized text and the time it understood appear right away, like "✓ Sat, Oct 10 3:00 PM". If you see "⏳ Waiting for a date or time…", just add the date or time.',
  '오른쪽 위 ＋ 버튼으로 말하지 않고 직접 입력할 수도 있습니다.':
    'You can also type a schedule instead of speaking with the ＋ button at the top right.',
  '오른쪽 위 "설정" › 화면에서 다크/라이트 테마와 글자 크기(작게·보통·크게·아주 크게)를 고를 수 있습니다. 글자 크기는 앱의 모든 글자에 적용됩니다.':
    'In "Settings" › Display (top right) you can pick a dark or light theme, the text size (Small · Normal · Large · Extra large), and the language. The text size applies to every piece of text in the app.',

  // 2
  '2. 날짜·시간 말하는 요령': '2. How to say dates and times',
  '날짜: 오늘 · 내일 · 모레 · 글피 · N일 후 · 이번 주/다음 주 + 요일 · "10월 15일"처럼 월과 일':
    'Dates: today · tomorrow · the day after tomorrow · in N days · this/next + weekday · a month and day like "October 15"',
  '시간: "오후 세 시", "15시", "세 시 반", "일곱 시 이십 분", "아침/점심/저녁/밤/새벽 N시". "N분 후", "N시간 후"도 됩니다.':
    'Times: "3pm", "15:00", "half past three", "seven twenty", "N in the morning/afternoon/evening". "In N minutes" and "in N hours" work too.',
  '"밤 12시"는 그날 밤(다음 날 0시)으로, "2월 30일"처럼 없는 날짜는 받지 않습니다.':
    '"Midnight" means that night (0:00 the next day). Dates that do not exist, like "February 30", are not accepted.',
  '시간만 말하면 오늘로, 그 시각이 이미 지났으면 내일로 잡습니다.':
    'If you only say a time, it is set for today, or for tomorrow if that time has already passed.',
  '"저녁 7시 운동"은 "운동"으로, "19시 저녁 식사"는 "저녁 식사"로 내용이 남습니다. 시간대 단어는 시각 앞에 올 때만 시간으로 봅니다.':
    '"Workout at 7 in the evening" is saved as "Workout", and "Dinner at 19:00" as "Dinner". Words like morning/evening count as a time only when they go with a clock time.',

  // 3
  '3. 날짜 없이 말했을 때': '3. When you don’t say a date',
  '"우유 사기"처럼 날짜·시간을 한마디도 안 하고 말해도 녹음은 버리지 않습니다. 오늘 날짜(시간 미정)로 임시 저장되고 알람은 걸리지 않습니다.':
    'If you say something like "buy milk" with no date or time at all, the recording is still kept. It is saved for today (no time) for now, and no alarm is set.',
  '그 일정 카드에는 "언제인지 아직 안 정했어요 · 정하기" 꼬리표가 계속 남습니다. 서두를 필요 없이 아무 때나 "정하기"를 눌러 날짜·시간을 고르면 꼬리표가 사라집니다.':
    'That card keeps a "No date yet · Set" tag. There is no rush: tap "Set" whenever you like to choose a date and time, and the tag goes away.',
  '편집기 맨 위의 오늘 · 내일 · 모레 버튼으로 날짜를 한 번에 고를 수 있습니다.':
    'The Today · Tomorrow · Day after buttons at the top of the editor pick a date in one tap.',

  // 4
  '4. 달력 화면': '4. Calendar screen',
  '달력 오른쪽 아래 "월 | 주"로 월 보기와 주 보기를 바꿉니다. 고른 보기는 다음에 앱을 열어도 유지됩니다.':
    'Use "Month | Week" at the bottom right of the calendar to switch between month and week view. Your choice is remembered the next time you open the app.',
  '‹ › 로 한 달 또는 한 주씩 넘기고, 가운데 기간 글자를 누르면 오늘로 돌아옵니다.':
    '‹ › moves one month or one week at a time; tap the period label in the middle to jump back to today.',
  '달력 아래에는 보고 있는 달/주의 일정이 날짜별로 모두 나옵니다. 달력에서 날짜를 누르면 그 날짜 묶음으로 내려갑니다. 일정이 있는 날엔 점이 찍힙니다.':
    'Below the calendar, every schedule in the month or week you are viewing is listed by day. Tap a date in the calendar to scroll to that day. Days with schedules show a dot.',
  '카드의 내용은 두 줄로 요약해 보여줍니다. 전체 내용은 카드를 눌러 상세에서 봅니다.':
    'Cards show a two-line summary. Tap a card to read the full text on the detail screen.',

  // 5
  '5. 전체 일정 화면과 찾기': '5. All schedules and search',
  '위 검색창에 단어를 넣으면 내용·녹음 원문·추가 메모에서 바로 찾습니다.':
    'Type a word into the search box at the top to search the content, the recording transcript, and added notes instantly.',
  '기간 칩: 전체 · 오늘 · 이번 주 · 이번 달. "기간 선택 ▾"을 누르면 년 · 월 · 일 휠을 굴려 고를 수 있고, 각 휠의 "전체"를 두면 그 항목은 조건에서 빠집니다.':
    'Period chips: All · Today · This week · This month. Tap "Pick period ▾" to spin year · month · day wheels; leaving a wheel on "All" drops that part from the filter.',
  '결과 줄의 복사 · 텍스트 · PDF로 걸러진 일정을 한 번에 내보냅니다.':
    'Copy · Text · PDF on the results row export the filtered schedules all at once.',

  // 6
  '6. 일정 카드와 상세 화면': '6. Schedule cards and the detail screen',
  '카드 오른쪽 ▶ 로 녹음을 듣습니다. 다른 카드를 재생하면 먼저 것은 멈춥니다. "＋ 추가"로 같은 일정에 녹음이나 글을 덧붙일 수 있습니다.':
    'Tap ▶ on the right of a card to play the recording. Playing another card stops the first one. "＋ Add" attaches another recording or note to the same schedule.',
  '카드를 누르면 상세 화면이 열리고, 말한 단어들이 칩으로 나옵니다. 단어를 한 번 누르면 그 단어만 들리고, 단어를 길게 누른 채 옆으로 끌면 범위가 파란 띠로 표시되며 손을 떼면 그 구간이 재생됩니다.':
    'Tap a card to open the detail screen, where the words you said appear as chips. Tap a word to hear just that word; press and hold a word and drag sideways to select a range (shown as a blue band), then release to play that part.',
  '재생 중에는 읽고 있는 단어가 빨갛게 따라갑니다. 범위를 들은 뒤엔 "▶ N단어 다시 듣기" 바가 남아 반복해서 들을 수 있고 ✕로 지웁니다.':
    'During playback the current word is highlighted in red. After playing a range, a "▶ Replay N words" bar stays so you can listen again; clear it with ✕.',
  '스피커 / 수화기: 기본은 스피커(이어폰을 꽂으면 이어폰)입니다. 수화기를 고르면 귀에 대고 조용히 들을 수 있습니다.':
    'Speaker / Earpiece: the default is the speaker (or earphones when plugged in). Choose Earpiece to hold the phone to your ear and listen quietly.',
  '복사 · 텍스트 · PDF: 텍스트와 PDF는 먼저 미리보기가 뜨고, 그 화면 아래 버튼으로 내보냅니다.':
    'Copy · Text · PDF: Text and PDF show a preview first; export with the button at the bottom of that screen.',

  // 7
  '7. 고치기와 지우기': '7. Editing and deleting',
  '상세 화면 오른쪽 위 "수정"에서 날짜 · 시간(휠) · 내용 · 알람 방식을 바꿉니다. 내용 옆 마이크로 말해서 입력할 수도 있습니다.':
    'Tap "Edit" at the top right of the detail screen to change the date, time (wheels), content, and alarm type. You can also dictate the content with the mic next to it.',
  '말로 지우기: "내일 치과 예약 지워줘"처럼 날짜와 함께 "지워줘/삭제해줘"로 끝내면, 그날 일정 중 가장 가까운 것을 미리 보여주고 확인 후 지웁니다.':
    'Delete by voice: say a date and end with "delete" or "remove", like "delete the dentist appointment tomorrow". The closest matching schedule on that day is shown first and deleted after you confirm.',
  '같은 시각(±5분)에 이미 일정이 있으면 "추가로 붙이기 / 새 일정"을 물어봅니다.':
    'If a schedule already exists at the same time (±5 minutes), you are asked whether to "Add to it" or create a "New schedule".',

  // 8
  '8. 알람': '8. Alarms',
  '시간이 있는 일정은 그 시각에 알람이 울리고, 못 들었을 때를 위해 1분 · 2분 뒤에 한 번씩 더 울립니다. 알림의 "알람 끄기"를 누르면 남은 알림이 취소되고, "5분 뒤 다시"로 미룰 수 있습니다.':
    'A schedule with a time rings at that time, and once more after 1 and 2 minutes in case you missed it. "Stop alarm" on the notification cancels the remaining rings; "Snooze 5 min" puts it off.',
  '알람 방식은 일정마다 소리+진동 · 소리 · 진동 중에서 고릅니다(편집기 시간 옆 아이콘).':
    'Each schedule can use sound + vibration, sound only, or vibration only (the icon next to the time in the editor).',
  '미리 알림: 10분 전 · 30분 전 · 1시간 전 · 하루 전(전날 저녁 8시)을 여러 개 고를 수 있고, 각각 한 번씩 "30분 뒤 · 치과 예약"처럼 알려줍니다. "정각" 칩을 끄면 정각에는 울리지 않습니다. 설정 › 알람에서 새 일정의 기본 미리 알림을 정해 두면 자동으로 붙습니다. 이미 있는 일정은 상세 화면의 알림 칩을 눌러 바로 바꿀 수 있습니다(누르는 즉시 저장).':
    'Reminders: pick any of 10 min · 30 min · 1 hour · Day before (8 PM the previous evening). Each rings once, like "In 30 min · Dentist appointment". Turn off the "On time" chip to skip the ring at the scheduled time. Set default reminders for new schedules in Settings › Alarm. For existing schedules, tap the reminder chips on the detail screen; changes are saved immediately.',
  '하루 전 미리 알림은 전날 달력에 빈 점으로, 전날 목록에는 점선 테두리의 "⏰ 오후 8:00 · 미리 알림" 줄로 따로 보입니다(실제 일정 카드와 구분). 눌러 보면 원래 일정이 열립니다.':
    'A "Day before" reminder shows on the previous day as a hollow dot in the calendar and as a dashed "⏰ 8:00 PM · Reminder" row in that day’s list (separate from real schedule cards). Tap it to open the original schedule.',
  '말로도 됩니다: "내일 세 시 치과, 30분 전에 알려줘", "하루 전에 알려줘". 미리 알림을 끄거나 미뤄도 정각 알람은 그대로 울립니다.':
    'You can say it too: "Dentist tomorrow at 3, remind me 30 minutes before", "remind me the day before". Stopping or snoozing a reminder does not affect the alarm at the scheduled time.',
  'Android는 배터리 절약 때문에 알람이 1~2분 늦게 올 수 있습니다. 정확한 시각이 중요하면 설정에서 앱의 배터리 최적화를 꺼 주세요.':
    'On Android, battery saving can delay alarms by a minute or two. If exact timing matters, turn off battery optimization for the app in your phone settings.',
  '무음 스위치가 켜져 있어도 녹음 재생은 됩니다. 알람 소리는 기기 설정을 따릅니다.':
    'Recordings play even with the silent switch on. Alarm sound follows your device settings.',

  // 9
  '9. 백업과 폰 옮기기': '9. Backup and moving to a new phone',
  '설정 › 백업 · 폰 옮기기 › "지금 백업 만들기"를 누르면 일정 전부와 녹음 파일이 한 폴더에 모입니다.':
    'Settings › Backup · Move to a new phone › "Back up now" gathers every schedule and recording into one folder.',
  'iPhone: 파일 앱 › 나의 iPhone › 세이람 › mallo-backups 폴더에 백업이 보입니다. 이 폴더를 iCloud Drive나 컴퓨터에 복사해 두고, 새 폰에서 같은 자리에 넣은 뒤 목록에서 "복원"을 누르세요.':
    'iPhone: backups appear in the Files app › On My iPhone › SayRam › mallo-backups. Copy that folder to iCloud Drive or a computer, put it in the same place on the new phone, then tap "Restore" in the list.',
  'Android: "폴더로 내보내기"로 드라이브·다운로드 폴더에 저장하고, 새 폰에서 "폴더에서 가져오기"로 그 폴더를 고르면 됩니다.':
    'Android: use "Export to folder" to save to Drive or Downloads, then "Import from folder" on the new phone and pick that folder.',
  '복원은 이미 있는 일정은 그대로 두고 없는 것만 더합니다. 여러 번 눌러도 중복되지 않습니다.':
    'Restoring keeps the schedules you already have and adds only the missing ones. Restoring more than once never creates duplicates.',

  // 10
  '10. 이럴 땐': '10. Troubleshooting',
  '소리가 안 들려요: 이어폰(블루투스 포함)을 꼈다면 스피커 모드에서 이어폰으로 나옵니다. 수화기 모드는 폰 본체 윗부분 스피커로만 작게 납니다.':
    'No sound: with earphones (including Bluetooth) connected, Speaker mode plays through the earphones. Earpiece mode plays quietly through the small speaker at the top of the phone only.',
  '단어가 차례로 안 켜지고 한꺼번에 켜져요: 음성 인식기가 단어별 시각을 주지 않은 녹음입니다. 글자 수에 맞춰 대략의 위치로 따라가므로 조금 어긋날 수 있습니다.':
    'Words light up all at once instead of one by one: the recognizer did not provide per-word timing for that recording. Positions are estimated from text length, so they may be slightly off.',
  '긴 녹음(회의·강의)은 문장 사이 쉼에서 인식이 끊겨 뒷문장이 빠질 수 있습니다. 녹음 자체는 끊기지 않으니 재생으로 확인하세요.':
    'In long recordings (meetings, lectures), recognition can stop at a pause between sentences and miss what follows. The recording itself is not cut, so check by playing it back.',
  '녹음이 저장되지 않아요(Android 12 이하): 그 버전의 Android는 녹음과 음성 인식이 마이크를 같이 못 씁니다. 말한 내용은 글로 인식되어 일정·알람은 그대로 되지만 녹음 파일은 남지 않고, 녹음 화면에 그 안내가 보입니다. Android 13 이상 폰에서는 둘 다 됩니다.':
    'Recordings are not saved (Android 12 and earlier): on those versions, recording and speech recognition cannot share the microphone. Your words are still recognized and schedules and alarms work, but no audio file is kept; the recording screen shows a note about this. Android 13 and later supports both.',
  '마이크를 누르면 잠깐 "준비 중…"이 보였다가 "🎙 지금 말씀하세요"로 바뀝니다. 그때부터 말하면 첫마디가 잘리지 않습니다.': 'When you tap the mic you briefly see "Getting ready…", then "🎙 Speak now". Start talking then and your first words won\'t be cut off.',
  '＋ 화면에서도 내용 칸의 마이크로 말하면 녹음이 함께 저장됩니다. 글자를 칠 때는 키보드 위에 내용 칸만 크게 보이고, "입력 완료"를 누르면 날짜·시간 칸이 다시 나옵니다.': 'On the ＋ screen, speaking with the mic in the content box saves the recording too. While you type, only the content box shows above the keyboard; tap "Done" to bring back the date and time fields.',
  '"＋ 추가"에서 마이크를 누르면 소리 막대와 말하는 글이 바로 보입니다. 같은 화면에서 다시 녹음하면 앞 녹음을 새 녹음으로 바꿀지 먼저 물어봅니다.': 'In "＋ Add", tapping the mic shows the sound bars and your words right away. If you record again on the same screen, the app first asks whether to replace the earlier recording.',
  '이미 있는 일정을 "수정"할 때의 마이크는 글만 받아 적습니다. 원래 녹음은 바뀌지 않습니다.': 'When you edit an existing schedule, the mic only types your words. The original recording is not changed.',
  '지우기: 상세 화면 오른쪽 위 휴지통을 누르거나, 목록에서 카드를 길게 눌러 "삭제"를 고릅니다. 지우기 전에 한 번 더 확인합니다.': 'Deleting: tap the trash can at the top right of the detail screen, or long-press a card in the list and choose "Delete". The app asks once more before deleting.',
  '내 목소리 알람: 설정 › 알람 › 알람 소리에서 "내 목소리"를 고르면, 알람이 울릴 때 알람음이 잠깐 난 뒤 그 일정을 말한 녹음 앞부분(약 10초)을 들려줍니다. 일정마다 상세·수정 화면의 "🎙 내 목소리" 칩으로 따로 켜고 끌 수 있습니다. 녹음이 없는 일정과 진동 전용 일정은 기본 알람음·진동으로 울립니다.': 'My voice alarm: choose "My voice" in Settings › Alarm › Alarm sound, and when an alarm rings you hear a short alarm tone followed by the start of what you recorded for that schedule (about 10 seconds). You can turn it on or off per schedule with the "🎙 My voice" chip on the detail and edit screens. Schedules without a recording, and vibrate-only schedules, use the default alarm sound or vibration.',
  '카드의 아이콘: 🔔는 기본 알람음, 🎙는 내 목소리, 폰 그림은 진동입니다. 미리 알림은 그 옆에 "⏰ 30분 전"처럼 보입니다.': 'Card icons: 🔔 is the default alarm sound, 🎙 is My voice, and the phone picture is vibration. Early reminders appear next to them, like "⏰ 30 min before".',
  '내 목소리 알람인데 기본 알람음이 울려요: 그 일정에 녹음이 없거나(직접 입력, Android 12 이하), 진동 전용이거나, 폰을 켠 뒤 아직 한 번도 잠금을 풀지 않은 경우입니다. iPhone은 무음 스위치나 집중 모드가 켜져 있으면 알람 소리가 나지 않습니다.': 'A My voice alarm rang with the default sound: the schedule has no recording (typed in, or Android 12 and below), it is vibrate-only, or the phone has not been unlocked since it was turned on. On iPhone, alarm sounds are silent when the silent switch or a Focus mode is on.',
  '카드의 아이콘: 🔔는 소리, 폰 그림은 진동입니다. 미리 알림은 그 옆에 "⏰ 30분 전"처럼 보입니다.': 'Card icons: 🔔 is sound and the phone picture is vibration. Early reminders appear next to them, like "⏰ 30 min before".',
  '녹음한 시각으로 저장했어요': 'Saved at the time you recorded',
  '(녹음 시각)': '(time recorded)',
  '날짜·시간을 말하지 않아 녹음한 시각으로 저장했어요. 정하면 알람이 울려요': 'No date or time was said, so it was saved at the time you recorded. Set one to get an alarm.',
  '▶ 녹음 듣기': '▶ Play recording',
  '회의·강의 녹음이나 "우유 사기"처럼 날짜·시간을 말하지 않으면, 녹음을 시작한 날짜와 시각으로 저장합니다. 이미 지난 시각이라 알람은 걸리지 않습니다.': 'If you don\'t say a date or time — a meeting or lecture recording, or "buy milk" — it is saved at the date and time you started recording. That time has already passed, so no alarm is set.',
  '그 카드에는 "녹음한 시각으로 저장했어요 · 정하기"가 보입니다. 나중에 할 일이면 "정하기"로 날짜·시간을 고르면 알람이 걸리고, 회의·강의처럼 기록으로 둘 녹음이면 그대로 두면 됩니다. 녹음은 언제든 ▶로 들을 수 있습니다.': 'The card shows "Saved at the time you recorded · Set". If it is something to do later, tap "Set" and pick a date and time to get an alarm. If it is a record like a meeting or lecture, just leave it. You can play the recording with ▶ at any time.',
  '날짜를 정하지 않은 녹음은 그날 하루 동안 목록에 펼쳐 두고, 다음 날부터 지난 일정으로 접힙니다.': 'Recordings without a set date stay open in the list for that day and fold into past schedules from the next day.',
  '＋ 화면에서는 내용 칸 위의 빨간 "눌러서 말하기"를 누르고 말하면 녹음이 함께 저장됩니다. 누르면 그 자리에 소리 막대와 "■ 완료"가 나오고 말한 글이 바로 적힙니다. 글자를 칠 때는 키보드 위에 내용 칸만 크게 보이고, "입력 완료"를 누르면 날짜·시간 칸이 다시 나옵니다.': 'On the ＋ screen, tap the red "Tap to speak" bar above the content box and speak; the recording is saved too. The bar turns into sound bars and "■ Done", and your words appear right away. While you type, only the content box shows above the keyboard; tap "Done" to bring back the date and time fields.',
  '"＋ 추가"에서도 "눌러서 말하기"를 누르면 소리 막대와 말하는 글이 바로 보입니다. 같은 화면에서 다시 녹음하면 앞 녹음을 새 녹음으로 바꿀지 먼저 물어봅니다.': 'In "＋ Add", tapping "Tap to speak" also shows the sound bars and your words right away. If you record again on the same screen, the app first asks whether to replace the earlier recording.',
  '녹음이 없는 일정(글자로 입력한 일정 등)도 ▶를 누르면 폰의 음성으로 날짜·시간과 내용을 읽어 줍니다. 인터넷은 쓰지 않습니다.': 'Schedules without a recording (such as ones you typed) can also be played with ▶: your phone\'s voice reads out the date, time and content. No internet is used.',
  '상세 화면 오른쪽 위 "수정"에서 날짜 · 시간(휠) · 내용 · 알람 방식을 바꿉니다. "눌러서 말하기"로 말해서 입력할 수도 있고, 내용 옆 "▶ 녹음 듣기"로 원래 녹음을 들으며 고칠 수 있습니다.': 'Tap "Edit" at the top right of the detail screen to change the date, time (wheels), content and alarm type. You can also dictate with "Tap to speak", and listen to the original recording with "▶ Play recording" next to the content while you edit.',
};
