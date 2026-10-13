Pod::Spec.new do |s|
  s.name           = 'MalloVoiceSound'
  s.version        = '1.0.0'
  s.summary        = '일정 녹음 앞부분으로 iOS 알림 소리(wav)를 만드는 로컬 모듈'
  s.description    = '녹음(m4a)을 Library/Sounds 의 30초 이하 Linear PCM wav 로 바꿔 로컬 알림 소리로 쓸 수 있게 한다.'
  s.author         = 'danielpark'
  s.homepage       = 'https://github.com/danielpark/mallo'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
