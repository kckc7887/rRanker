Pod::Spec.new do |s|
  s.name = 'ArcadeMapSupport'
  s.version = '1.0.0'
  s.summary = 'rRanker native place search'
  s.description = 'rRanker native place search'
  s.license = 'AGPL-3.0-only'
  s.author = 'rRanker'
  s.homepage = 'https://github.com/kckc7887/rRanker'
  s.source = { git: 'https://github.com/kckc7887/rRanker.git' }
  s.platforms = { :ios => '15.1' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
