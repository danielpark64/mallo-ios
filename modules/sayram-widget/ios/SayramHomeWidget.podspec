Pod::Spec.new do |s|
  s.name           = 'SayramHomeWidget'  # 위젯 확장 타깃(SayramWidget)과 모듈 이름이 겹치지 않게
  s.version        = '1.0.0'
  s.summary        = '세이람 홈 화면 위젯 요약 전달(App Group)'
  s.description    = '세이람 홈 화면 위젯 요약 전달(App Group)'
  s.license        = 'UNLICENSED'
  s.author         = 'danielpark'
  s.homepage       = 'https://github.com/danielpark64/mallo-ios'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'WidgetKit'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
