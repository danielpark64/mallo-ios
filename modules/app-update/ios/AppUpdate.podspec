Pod::Spec.new do |s|
  s.name           = 'AppUpdate'
  s.version        = '1.0.0'
  s.summary        = '새 버전 안내 — 깔린 판·기기 나라 읽기'
  s.description    = '새 버전 안내 — 깔린 판·기기 나라 읽기'
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
