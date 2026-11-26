# 1.2.4 — 새 기능 문구 (2026-11-25 작성)

- 바뀐 것: "5분 후 다시"(스누즈)가 앱을 다시 열어도(시작·알람 소리 변경·백업 복원 때의 재동기화) 사라지지 않음(버그 31), 지난 일정에 결과(못 했어요·덜 했어요·바뀌었어요)를 표시하면 남은 스누즈·재알림이 울리지 않음(버그 30), iOS 26+ AlarmKit 울림 화면에 [5분 후 다시] 버튼(교대알람 구조).
- 버전: 1.2.4 / Android versionCode 11 / iOS buildNumber 21. Android·iOS 같은 버전으로 함께 제출.
- 알아 둘 것: 1.2.3에서 걸어 둔 JS 스누즈(Expo·AlarmKit)는 1.2.4로 올린 직후 첫 재동기화에서 한 번 지워질 수 있다(표시가 없던 옛 예약). Android 네이티브 스누즈는 남는다.

## Play — 출시 노트 (언어별 500자 이내)

<ko-KR>
• 5분 후 다시가 앱을 다시 열어도 사라지지 않아요
• 결과를 표시한 일정은 다시 울리지 않아요
• 작은 부분을 다듬었어요
</ko-KR>

<en-US>
• "Snooze 5 min" now stays set even after you reopen the app
• Events you've marked with a result won't ring again
• Small improvements
</en-US>

<ja-JP>
• アプリを開き直しても「5分後にもう一度」が消えなくなりました
• 結果を記録した予定はもう鳴りません
• 細かな改善を行いました
</ja-JP>

<zh-CN>
• 重新打开应用后，“5分钟后再响”也不会消失
• 已标记结果的日程不会再响
• 细节改进
</zh-CN>

<zh-TW>
• 重新開啟 App 後，「5分鐘後再響」也不會消失
• 已標記結果的行程不會再響
• 細節改進
</zh-TW>

<es-ES>
• «Posponer 5 min» ya no desaparece al volver a abrir la app
• Los eventos con un resultado marcado no vuelven a sonar
• Pequeñas mejoras
</es-ES>

<fr-FR>
• « Répéter dans 5 min » ne disparaît plus quand vous rouvrez l'app
• Les événements dont vous avez noté le résultat ne sonnent plus
• Petites améliorations
</fr-FR>

<de-DE>
• „In 5 Min. erneut" bleibt erhalten, auch wenn du die App wieder öffnest
• Termine mit eingetragenem Ergebnis klingeln nicht mehr
• Kleine Verbesserungen
</de-DE>

<pt-BR>
• "Adiar 5 min" não some mais quando você reabre o app
• Compromissos com resultado marcado não tocam de novo
• Pequenas melhorias
</pt-BR>

## App Store — "이 버전의 새로운 기능"
iOS 26 이상은 알람 화면(AlarmKit)에 [5분 후 다시] 버튼이 새로 생겨 첫 줄로 넣는다(iOS 26 미만은 예전처럼 알림의 '5분 후 다시' 버튼). 언어 코드: ko, en-US, ja, zh-Hans, zh-Hant, es-ES, fr-FR, de-DE, pt-BR.

- ko: • iOS 26 알람 화면에 5분 후 다시 버튼이 생겼어요 • 5분 후 다시가 앱을 다시 열어도 사라지지 않아요 • 결과를 표시한 일정은 다시 울리지 않아요 • 작은 부분을 다듬었어요
- en-US: • The iOS 26 alarm screen now has a "Snooze 5 min" button • "Snooze 5 min" now stays set even after you reopen the app • Events you've marked with a result won't ring again • Small improvements
- ja: • iOS 26のアラーム画面に「5分後にもう一度」ボタンが付きました • アプリを開き直しても「5分後にもう一度」が消えなくなりました • 結果を記録した予定はもう鳴りません • 細かな改善を行いました
- zh-Hans: • iOS 26 闹钟画面新增“5分钟后再响”按钮 • 重新打开应用后，“5分钟后再响”也不会消失 • 已标记结果的日程不会再响 • 细节改进
- zh-Hant: • iOS 26 鬧鐘畫面新增「5分鐘後再響」按鈕 • 重新開啟 App 後，「5分鐘後再響」也不會消失 • 已標記結果的行程不會再響 • 細節改進
- es-ES: • La pantalla de alarma de iOS 26 ahora tiene el botón «Posponer 5 min» • «Posponer 5 min» ya no desaparece al volver a abrir la app • Los eventos con un resultado marcado no vuelven a sonar • Pequeñas mejoras
- fr-FR: • L'écran d'alarme d'iOS 26 a désormais un bouton « Répéter dans 5 min » • « Répéter dans 5 min » ne disparaît plus quand vous rouvrez l'app • Les événements dont vous avez noté le résultat ne sonnent plus • Petites améliorations
- de-DE: • Der Alarmbildschirm unter iOS 26 hat jetzt die Taste „In 5 Min. erneut" • „In 5 Min. erneut" bleibt erhalten, auch wenn du die App wieder öffnest • Termine mit eingetragenem Ergebnis klingeln nicht mehr • Kleine Verbesserungen
- pt-BR: • A tela de alarme do iOS 26 agora tem o botão "Adiar 5 min" • "Adiar 5 min" não some mais quando você reabre o app • Compromissos com resultado marcado não tocam de novo • Pequenas melhorias
