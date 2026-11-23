Pod::Spec.new do |s|
  s.name           = 'SayramAlarmKit'
  s.version        = '1.0.0'
  s.summary        = '세이람 iOS 26+ AlarmKit 예약'
  s.description    = '세이람 iOS 26+ AlarmKit 예약 — iOS 26 미만에서는 아무것도 하지 않는다'
  s.license        = 'UNLICENSED'
  s.author         = 'danielpark'
  s.homepage       = 'https://github.com/danielpark64/mallo-ios'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
  # ⚠️ 배포 대상이 16.4라 AlarmKit은 약한 링크여야 한다 — 강한 링크면 iOS 26 미만에서 실행 즉시 죽는다.
  s.weak_frameworks = 'AlarmKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.user_target_xcconfig = { 'OTHER_LDFLAGS' => '$(inherited) -weak_framework AlarmKit' }
end
