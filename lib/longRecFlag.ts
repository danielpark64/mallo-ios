// ─── [LONGREC] 긴 녹음(회의·강의) 켜기 스위치 ───────────────────────────────────────
// ★ 보류된 기능 — 상용 빌드에서는 꺼져 있다 (2026-11-14 결정: 1.1.0에서는 빼고 더 시험한다).
//   코드는 지우지 않고 남겨 두었다. 다시 켜려면:
//     1) 아래 LONGREC_ENABLED 를 true 로
//     2) components/LongRecSheet.tsx 의 한국어 문구를 lib/i18n 에 넣고 9개 언어 번역
//        (지금은 한국어만 있어서 켠 채로 내면 다른 언어 화면에 한국어가 섞인다)
//     3) 사용설명서(lib/helpContent.ts)에 쓰는 법 추가
//   관련 코드는 전부 "[LONGREC]" 으로 검색된다.
//   꺼져 있는 동안: 설정에 항목이 보이지 않는다(저장된 녹음이 있어도 건드리지 않는다).
// 남은 과제: 폰 음성 인식이 중간에 끊겨 몇 마디가 빠진다 · 멀리서 나는 소리·여러 명 회의는 정확도가 낮다
//   · 화면을 켜 둬야 한다 · Android 12 이하는 받아쓰기 없이 녹음만 된다.
// 이 파일은 일부러 아무것도 import 하지 않는다 — 설정 화면이 스위치 하나 읽으려고
// 녹음·인쇄 모듈(lib/longRec.ts)을 거쳐 가지 않게 하기 위해서다.
// (다만 설정 화면이 LongRecSheet 를 정적 import 하므로 그 모듈들은 앱 시작 때 함께 평가된다.
//  expo-audio·expo-print·expo-sharing·expo-speech-recognition 은 앱의 다른 화면도 이미 쓰고 있어
//  실제로 늘어난 부담은 expo-keep-awake 하나뿐이다.)

export const LONGREC_ENABLED = false;
