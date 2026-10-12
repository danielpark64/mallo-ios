// 영어 사전 — main 그룹 (키 = 한국어 원문)
// App.tsx(메인 화면·녹음 시트·Alert) + ScheduleCard·PreAlarmRow·Calendar·MicIcon
export const EN_MAIN: Record<string, string> = {
  // ── 헤더·탭 ──
  '세이람': 'SayRam',
  '다음 ·': 'Next ·',
  '설정': 'Settings',
  '달력': 'Calendar',
  '전체 일정': 'All Schedules',

  // ── 달력 탭 ──
  '{label} 일정': '{label} schedules',
  '{n}건': '{n} items',
  '이 주에는 일정이 없어요': 'Nothing scheduled this week',
  '이 달에는 일정이 없어요': 'Nothing scheduled this month',
  '오늘': 'Today',

  // ── 전체 일정 탭 ──
  '전체': 'All',
  '이번 주': 'This week',
  '이번 달': 'This month',
  '기간 선택 ▾': 'Pick dates ▾',
  '내용으로 찾기': 'Search by content',
  '일정 검색': 'Search schedules',
  '검색어 지우기': 'Clear search',
  '결과 {n}건': '{n} results',
  '전체 {n}건': '{n} total',
  '초기화': 'Reset',
  '복사': 'Copy',
  '텍스트': 'Text',
  '조건에 맞는 일정이 없어요': 'No schedules match',
  '등록된 일정이 없어요': 'No schedules yet',
  '아래 마이크 버튼으로 말해서 바로 추가해보세요': 'Tap the mic button below and just say it',

  // ── 권한·녹음 Alert ──
  '권한 필요': 'Permission needed',
  '마이크 및 음성 인식 권한이 모두 필요합니다.': 'Both microphone and speech recognition permissions are needed.',
  '권한 없음': 'No permission',
  '마이크 및 음성 인식 권한을 허용해주세요.': 'Please allow microphone and speech recognition.',
  '녹음 실패': 'Recording failed',
  '녹음 파일이 만들어지지 않았어요. 다시 시도해주세요.': 'The recording could not be saved. Please try again.',
  '인식 실패': 'Not recognized',
  '음성이 인식되지 않았어요. 다시 시도해주세요.': 'No speech was recognized. Please try again.',
  '확인': 'OK',
  '취소': 'Cancel',
  '완료': 'Done',

  // ── 삭제·중복 Alert ──
  '삭제할 일정을 못 찾았어요': 'Could not find a schedule to delete',
  '"{text}"\n\n어느 날 일정을 지울지 날짜를 함께 말씀해주세요.': '"{text}"\n\nPlease say which day\'s schedule to delete.',
  '삭제할 일정 없음': 'Nothing to delete',
  '{day}에 일정이 없어요.': 'There is nothing scheduled on {day}.',
  '같은 날 다른 일정:': 'Other schedules that day:',
  '일정 삭제': 'Delete schedule',
  '삭제할 일정:\n"{content}"\n{when}': 'Delete this schedule?\n"{content}"\n{when}',
  '삭제': 'Delete',
  '비슷한 시간 일정이 있어요': 'There is a schedule around the same time',
  '기존: "{old}"\n{when}\n\n새로 인식:\n"{new}"': 'Existing: "{old}"\n{when}\n\nJust heard:\n"{new}"',
  '추가로 붙이기': 'Add to it',
  '새 일정': 'New schedule',

  // ── 알림 본문 대체 ──
  '미리 알림': 'Reminder',
  '알람': 'Alarm',

  // ── 녹음 시트 ──
  '듣고 있어요': 'Listening',
  '말씀해보세요…\n예: "내일 오후 3시에 회의"': 'Go ahead and speak…\ne.g. "Meeting tomorrow at 3 pm"',
  '⏳ 날짜·시간을 기다리는 중…': '⏳ Waiting for a date or time…',

  // ── 일정 카드 ──
  '날짜 미정': 'No date',
  '시간 미정': 'No time',
  '(내용 없음)': '(No content)',
  '{m}월 {d}일': '{m}/{d}',
  '정각 없음': 'No on-time alarm',
  '날짜 정하기': 'Set a date',
  '언제인지 아직 안 정했어요': 'Date not set yet',
  '정하기': 'Set',
  '추가 {n}건': '{n} added',
  '⏸ 멈춤': '⏸ Stop',
  '▶ 듣기': '▶ Play',
  '＋ 추가': '＋ Add',

  // ── 하루 전 미리 알림 줄 ──
  '미리 알림 · 하루 전': 'Reminder · 1 day before',
  '내일 {time} · {text}': 'Tomorrow {time} · {text}',

  // ── 달력 ──
  '지난 주': 'Previous week',
  '지난 달': 'Previous month',
  '다음 주': 'Next week',
  '다음 달': 'Next month',
  '오늘로 이동': 'Go to today',
  '오늘로': 'Today',
  '월 보기': 'Month view',
  '주 보기': 'Week view',
  '월': 'Month',
  '주': 'Week',

  // ── 마이크 아이콘 ──
  '마이크': 'Microphone',
};
