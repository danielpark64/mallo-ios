Pod::Spec.new do |s|
  s.name           = 'SayramShare'
  s.version        = '1.0.0'
  s.summary        = '세이람 ↔ 교대알람 기기 안 공유(App Group)'
  s.description    = '세이람 ↔ 교대알람 기기 안 공유(App Group)'
  s.license        = 'UNLICENSED'
  s.author         = 'danielpark'
  s.homepage       = 'https://github.com/danielpark64/mallo-ios'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
