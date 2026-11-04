require 'fileutils'

binary_root = File.dirname(Pod::Executable.execute_command('node', ['--print', "require.resolve('@kckc7887/maimai-save-mobile/package.json')"], true).strip)
FileUtils.mkdir_p(File.join(__dir__, 'build'))
FileUtils.ln_sf(File.join(binary_root, 'ios', 'MaimaiSave.xcframework'), File.join(__dir__, 'build', 'MaimaiSave.xcframework'))
FileUtils.ln_sf(File.join(binary_root, 'THIRD_PARTY_NOTICES.txt'), File.join(__dir__, 'build', 'THIRD_PARTY_NOTICES.txt'))

Pod::Spec.new do |s|
  s.name = 'MaimaiSaveModule'
  s.version = '1.0.0'
  s.summary = 'rRanker score sync'
  s.description = 'rRanker score sync'
  s.license = 'AGPL-3.0-only'
  s.author = 'rRanker'
  s.homepage = 'https://github.com/kckc7887/rRanker'
  s.source = { git: 'https://github.com/kckc7887/rRanker.git' }
  s.platforms = { :ios => '16.4' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.vendored_frameworks = 'build/MaimaiSave.xcframework'
  s.resources = 'build/THIRD_PARTY_NOTICES.txt'
  s.frameworks = 'Security', 'SystemConfiguration'
  s.libraries = 'resolv', 'iconv'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
